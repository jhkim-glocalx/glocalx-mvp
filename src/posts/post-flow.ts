import { canUseLiveGbpActions } from "@/gbp/state-machine"

import { stableId } from "./post-repository"
import { createPostMediaUrl } from "./post-media"
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

type PublishedPostBody = {
  readonly externalPostId: string
  readonly publicUrl: string
}

function publishingNotConfigured(
  targetChannel: PublishPostDraftOptions["targetChannel"]
): PublishPostResult {
  return targetChannel === "GBP"
    ? {
        status: "BLOCKED",
        code: "GBP_PUBLISH_NOT_CONFIGURED",
        message: "Google 비즈니스 프로필 게시 연결 정보를 확인해주세요.",
      }
    : {
        status: "BLOCKED",
        code: "INSTAGRAM_PUBLISH_NOT_CONFIGURED",
        message: "Instagram 비즈니스 계정 연결 정보를 확인해주세요.",
      }
}

async function publishBodyForDraft(
  options: PublishPostDraftOptions,
  draft: NonNullable<
    Awaited<ReturnType<PublishPostDraftOptions["postStore"]["readDraft"]>>
  >
): Promise<PublishedPostBody | PublishPostResult> {
  const preview = draft.preview?.platformPreviews?.find(
    (item) => item.platform === options.targetChannel
  )
  const summary = preview?.copy ?? draft.koreanCopy
  const sourceImages = draft.preview?.sourceImages ?? []
  const mediaUrls =
    options.adapters.mode === "stub"
      ? sourceImages.length === 0
        ? ["https://stub.invalid/social-post.jpg"]
        : sourceImages.map(
            (asset) => `https://stub.invalid/${encodeURIComponent(asset.id)}`
          )
      : sourceImages
          .map((asset) => createPostMediaUrl(draft.id, asset.id))
          .filter((url): url is string => url !== undefined)

  if (
    options.adapters.mode === "production" &&
    (sourceImages.length === 0 || mediaUrls.length !== sourceImages.length)
  ) {
    return publishingNotConfigured(options.targetChannel)
  }

  if (options.targetChannel === "GBP") {
    const credentials = await options.postStore.readGbpPublishingCredentials(
      options.storeId
    )
    if (credentials === undefined) {
      return publishingNotConfigured("GBP")
    }
    const adapterResult = await options.adapters.gbpLocalPosts.createLocalPost({
      accessToken: credentials.accessToken,
      mediaUrls,
      parent: credentials.parent,
      summary,
    })
    if (adapterResult.kind === "blocked_by_credentials") {
      return publishingNotConfigured("GBP")
    }
    return adapterResult.value
  }

  const adapterResult = await options.adapters.instagramPosts.createPost({
    caption: summary,
    mediaUrls,
  })
  if (adapterResult.kind === "blocked_by_credentials") {
    return publishingNotConfigured("INSTAGRAM")
  }
  return adapterResult.value
}

export async function createPostDraft(
  options: CreatePostDraftOptions
): Promise<PostDraftResult> {
  const location = await options.postStore.readCurrentLocation(options.storeId)
  const eligibility = canUseLiveGbpActions(location.status)
  const preview = await buildMarketingPreview(
    options,
    options.targetChannel === "INSTAGRAM" || eligibility.kind === "allowed"
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
  if (options.targetChannel === "GBP") {
    const location = await options.postStore.readCurrentLocation(
      options.storeId
    )
    const eligibility = canUseLiveGbpActions(location.status)
    if (eligibility.kind === "blocked") {
      return {
        status: "BLOCKED",
        code: eligibility.code,
        message: eligibility.message,
      }
    }
  }

  const draft = await options.postStore.readDraft(
    options.draftId,
    options.storeId
  )
  if (draft === undefined) {
    return {
      status: "BLOCKED",
      code: "DRAFT_NOT_FOUND",
      message: "게시물 초안을 찾을 수 없습니다.",
    }
  }

  const failedAttemptCount = await options.postStore.countFailedAttempts(
    options.draftId,
    options.targetChannel
  )
  const idempotencyKey =
    options.idempotencyKey ??
    `publish-${options.targetChannel.toLowerCase()}-${options.draftId}-${failedAttemptCount + 1}`

  if (failedAttemptCount >= 3) {
    return {
      status: "MANUAL_PUBLISH_REQUIRED",
      code: "POST_PUBLISH_RETRY_LIMIT",
      message: `게시 시도가 3회 실패했습니다. ${
        options.targetChannel === "GBP"
          ? "Google Business Profile"
          : "Instagram"
      }에서 직접 게시하고 상태를 확인해주세요.`,
    }
  }

  const reservation = await options.postStore.reservePublishAttempt({
    draftId: options.draftId,
    idempotencyKey,
    now: options.adapters.clock.now(),
    platform: options.targetChannel,
    storeId: options.storeId,
  })
  if (reservation.kind === "not_found") {
    return {
      status: "BLOCKED",
      code: "DRAFT_NOT_FOUND",
      message: "게시물 초안을 찾을 수 없습니다.",
    }
  }
  if (reservation.kind === "conflict") {
    return {
      status: "BLOCKED",
      code: "IDEMPOTENCY_KEY_CONFLICT",
      message: "같은 게시 요청 키가 다른 게시물에 이미 사용되었습니다.",
    }
  }
  if (reservation.kind === "in_progress") {
    return {
      status: "BLOCKED",
      code: "PUBLISH_IN_PROGRESS",
      message: "같은 게시 요청이 이미 진행 중입니다.",
    }
  }
  if (
    reservation.kind === "replay" &&
    reservation.attempt.externalPostId !== null &&
    reservation.attempt.publicUrl !== null
  ) {
    return {
      status: "PUBLISHED",
      draftId: options.draftId,
      externalPostId: reservation.attempt.externalPostId,
      platform: options.targetChannel,
      publicUrl: reservation.attempt.publicUrl,
      attemptNumber: reservation.attempt.attemptNumber,
      history: await options.postStore.readPublishHistory(
        options.draftId,
        options.targetChannel
      ),
    }
  }
  if (reservation.kind !== "reserved") {
    return {
      status: "BLOCKED",
      code: "PUBLISH_IN_PROGRESS",
      message: "같은 게시 요청이 이미 진행 중입니다.",
    }
  }

  let body: PublishedPostBody | PublishPostResult
  try {
    body = await publishBodyForDraft(options, draft)
  } catch {
    await options.postStore.failPublishAttempt({
      draftId: options.draftId,
      idempotencyKey,
      platform: options.targetChannel,
    })
    return {
      status: "BLOCKED",
      code: "PUBLISH_FAILED",
      message:
        "게시 채널에서 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.",
    }
  }
  if ("status" in body) {
    await options.postStore.releasePublishAttempt({
      draftId: options.draftId,
      idempotencyKey,
      platform: options.targetChannel,
    })
    return body
  }

  await options.postStore.completePublishAttempt({
    draftId: options.draftId,
    externalPostId: body.externalPostId,
    idempotencyKey,
    platform: options.targetChannel,
    publicUrl: body.publicUrl,
    storeId: options.storeId,
  })

  return {
    status: "PUBLISHED",
    draftId: options.draftId,
    externalPostId: body.externalPostId,
    platform: options.targetChannel,
    publicUrl: body.publicUrl,
    attemptNumber: reservation.attempt.attemptNumber,
    history: await options.postStore.readPublishHistory(
      options.draftId,
      options.targetChannel
    ),
  }
}
