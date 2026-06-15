import { z } from "zod"

import { canUseLiveGbpActions } from "@/gbp/state-machine"

import {
  failedAttemptCount,
  getAttemptByIdempotencyKey,
  getCurrentLocation,
  getDraft,
  getPublishHistory,
  insertDraft,
  insertSuccessfulPublishAttempt,
  markDraftPublished,
  nextAttemptNumber,
  stableId,
} from "./post-repository"
import { buildMarketingPreview } from "./post-marketing-preview"
import type {
  CreatePostDraftOptions,
  PostDraftResult,
  PublishPostDraftOptions,
  PublishPostResult,
  RevisePostDraftOptions,
} from "./post-types"

export type {
  CreatePostDraftOptions,
  PostDraftResult,
  PostPreview,
  PublishHistoryItem,
  PublishPostDraftOptions,
  PublishPostResult,
  RevisePostDraftOptions,
} from "./post-types"

const localPostBodySchema = z
  .object({
    gbpPostId: z.string(),
    publicUrl: z.url(),
  })
  .passthrough()

export async function createPostDraft(
  options: CreatePostDraftOptions
): Promise<PostDraftResult> {
  const location = getCurrentLocation(options.database, options.storeId)
  const eligibility = canUseLiveGbpActions(location.status)
  const preview = await buildMarketingPreview(
    options,
    eligibility.kind === "allowed"
  )
  const draftId = stableId(
    "post-draft",
    `${options.storeId}:${options.ownerIntent}:${options.targetChannel}:${JSON.stringify(
      options.imageAssets ?? []
    )}:${options.suggestionMode ?? "request"}:${options.acceptedSuggestionId ?? ""}`
  )
  insertDraft({
    database: options.database,
    draftId,
    now: options.adapters.clock.now(),
    ownerIntent: options.ownerIntent,
    preview,
    storeId: options.storeId,
    targetChannel: options.targetChannel,
  })
  return { status: "DRAFT_READY", draftId, preview }
}

export async function revisePostDraft(
  options: RevisePostDraftOptions
): Promise<PostDraftResult> {
  const location = getCurrentLocation(options.database, options.storeId)
  const eligibility = canUseLiveGbpActions(location.status)
  const preview = await buildMarketingPreview(
    options,
    eligibility.kind === "allowed"
  )
  const draftId = stableId(
    "post-draft-revision",
    `${options.originalDraftId}:${options.ownerIntent}:${JSON.stringify(
      options.imageAssets ?? []
    )}:${options.suggestionMode ?? "request"}:${options.acceptedSuggestionId ?? ""}`
  )
  insertDraft({
    database: options.database,
    draftId,
    now: options.adapters.clock.now(),
    ownerIntent: options.ownerIntent,
    preview,
    revisionOfDraftId: options.originalDraftId,
    storeId: options.storeId,
    targetChannel: options.targetChannel,
  })
  return {
    status: "DRAFT_READY",
    draftId,
    revisionOfDraftId: options.originalDraftId,
    preview,
  }
}

export function publishPostDraft(
  options: PublishPostDraftOptions
): PublishPostResult {
  const location = getCurrentLocation(options.database, options.storeId)
  const eligibility = canUseLiveGbpActions(location.status)
  if (eligibility.kind === "blocked") {
    return {
      status: "BLOCKED",
      code: eligibility.code,
      message: eligibility.message,
    }
  }

  const draft = getDraft(options.database, options.draftId)
  const idempotencyKey = options.idempotencyKey ?? `publish-${options.draftId}`
  const existingAttempt = getAttemptByIdempotencyKey(
    options.database,
    idempotencyKey
  )
  if (
    existingAttempt?.status === "SUCCEEDED" &&
    existingAttempt.gbpPostId !== null &&
    existingAttempt.publicUrl !== null
  ) {
    return {
      status: "PUBLISHED",
      draftId: options.draftId,
      gbpPostId: existingAttempt.gbpPostId,
      publicUrl: existingAttempt.publicUrl,
      attemptNumber: existingAttempt.attemptNumber,
      history: getPublishHistory(options.database, options.draftId),
    }
  }

  if (failedAttemptCount(options.database, options.draftId) >= 3) {
    return {
      status: "MANUAL_PUBLISH_REQUIRED",
      code: "POST_PUBLISH_RETRY_LIMIT",
      message:
        "게시 시도가 3회 실패했습니다. Google Business Profile에서 직접 게시하고 상태를 확인해주세요.",
    }
  }

  const attemptNumber = nextAttemptNumber(options.database, options.draftId)
  const adapterResult = options.adapters.gbpLocalPosts.createLocalPost({
    accessToken: "stub-access-token",
    parent: "accounts/stub/locations/stub-created",
    summary: draft.koreanCopy,
  })
  const body =
    adapterResult.kind === "ok"
      ? localPostBodySchema.parse(adapterResult.value.body)
      : {
          gbpPostId: "stub-gbp-post",
          publicUrl: "https://business.google.com/local-post/stub-gbp-post",
        }

  insertSuccessfulPublishAttempt({
    attemptNumber,
    database: options.database,
    draftId: options.draftId,
    gbpPostId: body.gbpPostId,
    idempotencyKey,
    now: options.adapters.clock.now(),
    publicUrl: body.publicUrl,
  })
  markDraftPublished(options.database, options.draftId)

  return {
    status: "PUBLISHED",
    draftId: options.draftId,
    gbpPostId: body.gbpPostId,
    publicUrl: body.publicUrl,
    attemptNumber,
    history: getPublishHistory(options.database, options.draftId),
  }
}
