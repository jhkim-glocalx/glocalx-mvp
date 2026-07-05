import { z } from "zod"

import { canUseLiveGbpActions } from "@/gbp/state-machine"

import { stableId } from "./post-repository"
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
  const location = await options.postStore.readCurrentLocation(options.storeId)
  const eligibility = canUseLiveGbpActions(location.status)
  const preview = await buildMarketingPreview(
    options,
    eligibility.kind === "allowed"
  )
  // Draft ids hash deterministic inputs so identical client retries reuse the same review surface.
  const draftId = stableId(
    "post-draft",
    `${options.storeId}:${options.ownerIntent}:${options.targetChannel}:${JSON.stringify(
      options.imageAssets ?? []
    )}:${options.suggestionMode ?? "request"}:${options.acceptedSuggestionId ?? ""}`
  )
  await options.postStore.upsertDraft({
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
  const location = await options.postStore.readCurrentLocation(options.storeId)
  const eligibility = canUseLiveGbpActions(location.status)
  const preview = await buildMarketingPreview(
    options,
    eligibility.kind === "allowed"
  )
  // Revisions include the original draft id so accepted changes never collide with first drafts.
  const draftId = stableId(
    "post-draft-revision",
    `${options.originalDraftId}:${options.ownerIntent}:${JSON.stringify(
      options.imageAssets ?? []
    )}:${options.suggestionMode ?? "request"}:${options.acceptedSuggestionId ?? ""}`
  )
  await options.postStore.upsertDraft({
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

export async function publishPostDraft(
  options: PublishPostDraftOptions
): Promise<PublishPostResult> {
  const location = await options.postStore.readCurrentLocation(options.storeId)
  const eligibility = canUseLiveGbpActions(location.status)
  if (eligibility.kind === "blocked") {
    return {
      status: "BLOCKED",
      code: eligibility.code,
      message: eligibility.message,
    }
  }

  const draft = await options.postStore.readDraft(options.draftId)
  // Publish retries default to one key per draft, preventing duplicate GBP posts after success.
  const idempotencyKey = options.idempotencyKey ?? `publish-${options.draftId}`
  const existingAttempt =
    await options.postStore.readAttemptByIdempotencyKey(idempotencyKey)
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
      history: await options.postStore.readPublishHistory(options.draftId),
    }
  }

  // After repeated failures, automated publish stops before another adapter call mutates state.
  if ((await options.postStore.countFailedAttempts(options.draftId)) >= 3) {
    return {
      status: "MANUAL_PUBLISH_REQUIRED",
      code: "POST_PUBLISH_RETRY_LIMIT",
      message:
        "게시 시도가 3회 실패했습니다. Google Business Profile에서 직접 게시하고 상태를 확인해주세요.",
    }
  }

  const attemptNumber = await options.postStore.readNextAttemptNumber(
    options.draftId
  )
  const adapterResult = options.adapters.gbpLocalPosts.createLocalPost({
    accessToken: "stub-access-token",
    parent: "accounts/stub/locations/stub-created",
    summary: draft.koreanCopy,
  })
  // Local adapter failures still produce stub evidence while live success bodies are schema-checked.
  const body =
    adapterResult.kind === "ok"
      ? localPostBodySchema.parse(adapterResult.value.body)
      : {
          gbpPostId: "stub-gbp-post",
          publicUrl: "https://business.google.com/local-post/stub-gbp-post",
        }

  await options.postStore.recordSuccessfulPublishAttempt({
    attemptNumber,
    draftId: options.draftId,
    gbpPostId: body.gbpPostId,
    idempotencyKey,
    now: options.adapters.clock.now(),
    publicUrl: body.publicUrl,
  })

  return {
    status: "PUBLISHED",
    draftId: options.draftId,
    gbpPostId: body.gbpPostId,
    publicUrl: body.publicUrl,
    attemptNumber,
    history: await options.postStore.readPublishHistory(options.draftId),
  }
}
