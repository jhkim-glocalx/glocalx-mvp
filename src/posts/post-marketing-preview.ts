import type { CreatePostDraftOptions, PostPreview } from "./post-types"
import type { MarketingCaptionTranslation } from "@/integrations/contracts"

function hasHangul(value: string): boolean {
  return /\p{Script=Hangul}/u.test(value)
}

function safeEnglishCopy(englishCopy: string): string {
  if (englishCopy.trim() !== "" && !hasHangul(englishCopy)) {
    return englishCopy
  }
  return "Fresh local-store update: visit us in Seoul this week."
}

function fallbackTranslations(
  englishCopy: string
): readonly MarketingCaptionTranslation[] {
  return [
    {
      copy: safeEnglishCopy(englishCopy),
      label: "English",
      locale: "en",
    },
    {
      copy: "今週のおすすめ情報です。ソウルであたたかい時間をお楽しみください。",
      label: "Japanese",
      locale: "ja",
    },
    {
      copy: "本周新消息已经准备好。欢迎来到首尔享受温暖的用餐时光。",
      label: "Chinese",
      locale: "zh",
    },
  ]
}

async function buildPreview(
  options: CreatePostDraftOptions,
  canPublish: boolean
): Promise<PostPreview> {
  const store = await options.postStore.readStore(options.storeId)
  const generated = options.adapters.contentGeneration.generatePostCopy(
    options.ownerIntent
  )
  const copy =
    generated.kind === "ok"
      ? generated.value
      : {
          korean: `${options.ownerIntent} 소식을 전해드립니다.`,
          english: "Fresh local-store update for this week.",
        }

  return {
    canPublish,
    koreanCopy: `${store.name}에서 ${copy.korean}`,
    englishCopy: safeEnglishCopy(copy.english),
  }
}

async function buildFallbackMarketingPreview(
  options: CreatePostDraftOptions,
  canPublish: boolean,
  basePreview: PostPreview
): Promise<PostPreview> {
  const store = await options.postStore.readStore(options.storeId)
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
      objective:
        "업로드된 이미지와 알리고 싶은 말이나 단어를 바탕으로 방문을 유도",
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
        locale: "ko",
        platform: "GBP",
        translations: fallbackTranslations(basePreview.englishCopy),
        uploadNotes: ["매장명 포함", "짧은 본문", "대표 이미지 우선"],
      },
      {
        aspectRatio: "1:1",
        callToAction: "저장과 공유 유도",
        copy: `${store.name}의 ${options.ownerIntent} 소식. 이번 주말 따뜻한 브런치 한 접시로 약속을 완성해보세요.`,
        hashtags: ["#홍대브런치", "#주말브런치", "#hongdaecafe"],
        imageAssetId: primaryAssetId,
        label: "Instagram 피드",
        locale: "ko",
        platform: "INSTAGRAM",
        translations: fallbackTranslations(basePreview.englishCopy),
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
    sourceImages: imageAssets,
  }
}

export async function buildMarketingPreview(
  options: CreatePostDraftOptions,
  canPublish: boolean
): Promise<PostPreview> {
  const basePreview = await buildPreview(options, canPublish)
  const imageAssets = options.imageAssets ?? []
  if (imageAssets.length === 0) {
    return basePreview
  }

  const store = await options.postStore.readStore(options.storeId)
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
      ...(await buildFallbackMarketingPreview(
        options,
        canPublish,
        basePreview
      )),
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
    sourceImages: imageAssets,
  }
}
