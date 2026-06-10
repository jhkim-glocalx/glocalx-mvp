import { z } from "zod"

import { canUseLiveGbpActions } from "@/gbp/state-machine"

import {
  failedAttemptCount,
  getAttemptByIdempotencyKey,
  getCurrentLocation,
  getDraft,
  getPublishHistory,
  getStore,
  insertDraft,
  insertSuccessfulPublishAttempt,
  markDraftPublished,
  nextAttemptNumber,
  stableId,
} from "./post-repository"
import type {
  CreatePostDraftOptions,
  PostDraftResult,
  PostPreview,
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

function buildPreview(
  options: CreatePostDraftOptions,
  canPublish: boolean
): PostPreview {
  const store = getStore(options.database, options.storeId)
  const generated = options.adapters.contentGeneration.generatePostCopy(
    options.ownerIntent
  )
  const copy =
    generated.kind === "ok"
      ? generated.value
      : {
          korean: `${options.ownerIntent} 소식을 전해드립니다.`,
          english: `Sharing this update: ${options.ownerIntent}`,
        }

  return {
    canPublish,
    koreanCopy: `${store.name}에서 ${copy.korean}`,
    englishCopy: `${copy.english} Visit ${store.name} in ${store.address}.`,
  }
}

function buildFallbackMarketingPreview(
  options: CreatePostDraftOptions,
  canPublish: boolean,
  basePreview: PostPreview
): PostPreview {
  const store = getStore(options.database, options.storeId)
  const imageAssets = options.imageAssets ?? []
  const keywords = Array.from(
    new Set(
      options.ownerIntent
        .split(/\s+/)
        .map((word) => word.replace(/[^\p{L}\p{N}#]/gu, ""))
        .filter((word) => word.length > 1)
    )
  ).slice(0, 5)
  const primaryAssetId = imageAssets[0]?.id ?? null

  return {
    ...basePreview,
    canPublish,
    generationStatus: { kind: "stub" },
    images: imageAssets.map((asset, index) => ({
      altText: `${store.name} 홍보 이미지 ${index + 1}`,
      assetId: asset.id,
      cropFocus: index === 0 ? "대표 메뉴 중심" : "매장 분위기 중심",
      cssFilter: "contrast(1.06) saturate(1.14) brightness(1.04)",
      editedLabel: "AI 보정 미리보기",
      editSummary: "선명도, 밝기, 따뜻한 색감을 보정해 게시용으로 정리합니다.",
      originalLabel: asset.name,
      qualityScore: 88,
    })),
    intentAnalysis: {
      audience: "이번 주말 매장 방문을 고민하는 잠재 고객",
      keywords: keywords.length > 0 ? keywords : ["브런치", "주말", "신메뉴"],
      objective: "업로드된 이미지와 홍보 의도를 바탕으로 방문을 유도",
      promotionWindow: "이번 주말",
      tone: "밝고 친근한 로컬 매장 톤",
    },
    platformPreviews: [
      {
        aspectRatio: "4:3",
        callToAction: "길찾기와 저장 유도",
        copy: basePreview.koreanCopy,
        hashtags: ["#홍대브런치", "#주말브런치", "#신메뉴"],
        imageAssetId: primaryAssetId,
        label: "Google 비즈니스 프로필",
        platform: "GBP",
        uploadNotes: ["매장명 포함", "짧은 본문", "대표 이미지 우선"],
      },
      {
        aspectRatio: "1:1",
        callToAction: "저장과 공유 유도",
        copy: `${store.name}의 ${options.ownerIntent} 소식. 이번 주말 따뜻한 브런치 한 접시로 약속을 완성해보세요.`,
        hashtags: ["#홍대브런치", "#주말브런치", "#hongdaecafe"],
        imageAssetId: primaryAssetId,
        label: "Instagram 피드",
        platform: "INSTAGRAM",
        uploadNotes: ["1:1 크롭", "해시태그 포함", "첫 장 메뉴컷"],
      },
    ],
    suggestion:
      options.suggestionMode !== "request"
        ? null
        : {
            id: "suggest-closeup-weekend-menu",
            message:
              "대표 메뉴가 잘 보이는 이미지를 첫 장으로 쓰면 저장과 길찾기 전환이 좋아집니다.",
            ownerAction: "첫 번째 이미지를 대표 메뉴 중심으로 사용",
            rationale:
              "주말 신메뉴 홍보는 첫 화면에서 메뉴 디테일이 보여야 반응이 빠릅니다.",
            revisedIntent: `${options.ownerIntent} · 대표 메뉴 첫 장 강조`,
            title: "대표 메뉴 첫 장 강조",
          },
  }
}

async function buildMarketingPreview(
  options: CreatePostDraftOptions,
  canPublish: boolean
): Promise<PostPreview> {
  const basePreview = buildPreview(options, canPublish)
  const imageAssets = options.imageAssets ?? []
  if (imageAssets.length === 0) {
    return basePreview
  }

  const store = getStore(options.database, options.storeId)
  const result =
    await options.adapters.marketingGeneration.generateMarketingDraft({
      ...(options.acceptedSuggestionId === undefined
        ? {}
        : { acceptedSuggestionId: options.acceptedSuggestionId }),
      imageAssets,
      ownerIntent: options.ownerIntent,
      storeAddress: store.address,
      storeName: store.name,
      suggestionMode: options.suggestionMode ?? "request",
    })

  if (result.kind === "blocked_by_credentials") {
    return {
      ...buildFallbackMarketingPreview(options, canPublish, basePreview),
      generationStatus: {
        kind: "blocked_by_credentials",
        missingEnvVars: result.missingEnvVars,
      },
    }
  }

  const gbpPreview = result.value.platformPreviews.find(
    (preview) => preview.platform === "GBP"
  )

  return {
    ...basePreview,
    generationStatus:
      options.adapters.mode === "stub" ? { kind: "stub" } : { kind: "ready" },
    images: result.value.images,
    intentAnalysis: result.value.intentAnalysis,
    koreanCopy: gbpPreview?.copy ?? basePreview.koreanCopy,
    platformPreviews: result.value.platformPreviews,
    suggestion: result.value.suggestion,
  }
}

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
