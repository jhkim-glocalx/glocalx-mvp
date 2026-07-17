import type {
  MarketingCaptionTranslation,
  MarketingGenerationInput,
  MarketingGenerationResult,
} from "./contracts"

function splitIntentKeywords(intent: string): readonly string[] {
  const normalized = intent
    .replace(/[^\p{L}\p{N}\s#]/gu, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^#/, "").trim())
    .filter((word) => word.length >= 2)

  const defaults = ["브런치", "주말", "신메뉴"]
  return Array.from(new Set([...normalized, ...defaults])).slice(0, 5)
}

function translatedCaptions(
  platform: "GBP" | "INSTAGRAM"
): readonly MarketingCaptionTranslation[] {
  const english =
    platform === "GBP"
      ? "Weekend brunch news from Brunch Moment Hongdae. Visit us in Mapo-gu, Seoul for warm brunch and coffee this weekend."
      : "Complete your weekend brunch plans with the new menu at Brunch Moment Hongdae. Warm cafe mood and menu close-ups are ready for your feed."

  return [
    {
      copy: english,
      label: "English",
      locale: "en",
    },
    {
      copy:
        platform === "GBP"
          ? "ブランチモーメント弘大店から週末ブランチの新メニューをお知らせします。ソウル麻浦区で温かいブランチとコーヒーをお楽しみください。"
          : "今週末はブランチモーメント弘大店の新メニューで、ゆったりしたブランチの予定を完成させましょう。",
      label: "Japanese",
      locale: "ja",
    },
    {
      copy:
        platform === "GBP"
          ? "弘大 Brunch Moment 带来周末早午餐新菜单。欢迎来到首尔麻浦区享受温暖的早午餐和咖啡。"
          : "这个周末，用弘大 Brunch Moment 的新菜单完成你的早午餐计划。温暖的咖啡馆氛围和菜单特写都已准备好。",
      label: "Chinese",
      locale: "zh",
    },
  ]
}

export function createStubMarketingDraft(
  input: MarketingGenerationInput
): MarketingGenerationResult {
  const keywords = splitIntentKeywords(input.ownerIntent)
  const primaryAssetId = input.imageAssets[0]?.id ?? null
  const acceptedSuggestion = input.suggestionMode === "accepted"
  const copyIntent = acceptedSuggestion
    ? `${input.ownerIntent} 음식 클로즈업을 강조`
    : input.ownerIntent
  const hashtags = [
    "#홍대브런치",
    "#주말브런치",
    `#${keywords[0] ?? "브런치"}`,
    "#hongdaecafe",
  ]

  return {
    intentAnalysis: {
      audience: "이번 주말 홍대에서 브런치와 카페를 찾는 방문객",
      keywords,
      objective: acceptedSuggestion
        ? "신메뉴의 식감과 가까운 비주얼을 강조한 방문 유도"
        : "주말 신메뉴 프로모션으로 방문 예약과 저장을 유도",
      promotionWindow: "이번 주말",
      tone: "따뜻하고 선명한 매장 추천 톤",
    },
    images: input.imageAssets.map((asset, index) => ({
      altText: `${input.storeName} ${keywords[0] ?? "브런치"} 홍보 이미지 ${index + 1}`,
      assetId: asset.id,
      cropFocus:
        index === 0 ? "메인 메뉴 중심 1:1" : "매장 분위기와 테이블 여백",
      cssFilter:
        index === 0
          ? "contrast(1.08) saturate(1.16) brightness(1.04)"
          : "contrast(1.04) saturate(1.1) brightness(1.03)",
      editedLabel: index === 0 ? "선명도 + 메뉴 집중" : "밝기 + 색감 정리",
      editSummary:
        index === 0
          ? "대표 메뉴가 먼저 보이도록 선명도와 따뜻한 색감을 올렸습니다."
          : "전체 톤을 밝게 정리하고 플랫폼 크롭에 맞춰 중심을 잡았습니다.",
      originalLabel: asset.name,
      qualityScore: Math.max(82, 94 - index * 4),
    })),
    platformPreviews: [
      {
        aspectRatio: "4:3",
        callToAction: "길찾기와 저장을 유도",
        copy: `${input.storeName}에서 ${copyIntent} 소식을 전해드립니다. 따뜻한 브런치와 커피를 이번 주말 홍대에서 만나보세요.`,
        hashtags: hashtags.slice(0, 3),
        imageAssetId: primaryAssetId,
        label: "Google 비즈니스 프로필",
        locale: "ko",
        platform: "GBP",
        translations: translatedCaptions("GBP"),
        uploadNotes: ["짧은 첫 문장", "매장명 포함", "주말 방문 의도 강조"],
      },
      {
        aspectRatio: "1:1",
        callToAction: "저장과 공유를 유도",
        copy: `이번 주말, ${input.storeName}의 신메뉴로 브런치 약속을 완성해보세요. 부드러운 메뉴컷과 따뜻한 매장 분위기를 함께 담았습니다.`,
        hashtags,
        imageAssetId: primaryAssetId,
        label: "Instagram 피드",
        locale: "ko",
        platform: "INSTAGRAM",
        translations: translatedCaptions("INSTAGRAM"),
        uploadNotes: ["첫 장 메뉴 클로즈업", "해시태그 4개", "피드 1:1 크롭"],
      },
    ],
    suggestion:
      input.suggestionMode !== "request"
        ? null
        : {
            id: "suggest-closeup-weekend-menu",
            message:
              "대표 메뉴 클로즈업을 첫 장으로 쓰면 GBP와 인스타그램 모두에서 메뉴 인지가 더 빨라집니다.",
            ownerAction: "첫 번째 이미지를 메뉴 클로즈업 중심으로 사용",
            rationale:
              "업로드된 이미지와 의도상 주말 신메뉴가 핵심이라 첫 화면에서 음식 디테일을 크게 보여주는 편이 전환에 유리합니다.",
            revisedIntent: `${input.ownerIntent} · 대표 메뉴 클로즈업 강조`,
            title: "대표 메뉴 클로즈업을 첫 장으로 배치",
          },
  }
}
