import {
  isRecord,
  readString,
  readStringArray,
} from "@/app/_components/json-value"

import type {
  DraftImagePreview,
  DraftIntentAnalysis,
  DraftSuggestion,
  MarketingCaptionTranslation,
  MarketingLocale,
  MarketingPlatform,
  PlatformPostPreview,
} from "./app-workspace-draft-types"
import {
  completeTranslations,
  labelForLocale,
  readCaptionTranslations,
  readMarketingLocale,
} from "./app-workspace-translation-parser"

type ParsedPlatformPostPreview = Omit<PlatformPostPreview, "locale"> & {
  readonly locale: MarketingLocale
}

export function platformPreviewKey(
  preview: Pick<PlatformPostPreview, "platform">
): string {
  return preview.platform
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

export function parseIntentAnalysis(
  value: unknown
): DraftIntentAnalysis | null {
  if (!isRecord(value)) {
    return null
  }

  return {
    audience: readString(value["audience"]) ?? "방문 가능성이 높은 고객",
    keywords: readStringArray(value["keywords"]),
    objective: readString(value["objective"]) ?? "매장 소식 홍보",
    promotionWindow: readString(value["promotionWindow"]) ?? "오늘",
    tone: readString(value["tone"]) ?? "친근한 톤",
  }
}

function parseDraftImagePreview(value: unknown): DraftImagePreview | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const assetId = readString(value["assetId"])
  if (assetId === undefined) {
    return undefined
  }

  return {
    altText: readString(value["altText"]) ?? "게시 이미지",
    assetId,
    cropFocus: readString(value["cropFocus"]) ?? "중앙 크롭",
    cssFilter:
      readString(value["cssFilter"]) ??
      "contrast(1.06) saturate(1.12) brightness(1.03)",
    editedDataUrl: readString(value["editedDataUrl"]) ?? null,
    editedLabel: readString(value["editedLabel"]) ?? "AI 보정",
    editSummary: readString(value["editSummary"]) ?? "게시용 이미지로 보정",
    originalLabel: readString(value["originalLabel"]) ?? "원본 이미지",
    qualityScore: readNumber(value["qualityScore"]) ?? 88,
  }
}

export function readDraftImagePreviews(
  value: unknown
): readonly DraftImagePreview[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    const preview = parseDraftImagePreview(item)
    return preview === undefined ? [] : [preview]
  })
}

export function parseDraftSuggestion(value: unknown): DraftSuggestion | null {
  if (!isRecord(value)) {
    return null
  }

  const id = readString(value["id"])
  if (id === undefined) {
    return null
  }

  return {
    id,
    message: readString(value["message"]) ?? "추천을 반영할 수 있습니다.",
    ownerAction: readString(value["ownerAction"]) ?? "추천 반영",
    rationale: readString(value["rationale"]) ?? "성과 개선 가능성이 있습니다.",
    revisedIntent: readString(value["revisedIntent"]) ?? "",
    title: readString(value["title"]) ?? "방문을 늘리는 문구 제안",
  }
}

function legacyTranslationFromPreview(
  preview: ParsedPlatformPostPreview
): MarketingCaptionTranslation | undefined {
  if (preview.locale === "ko") {
    return undefined
  }
  return {
    copy: preview.copy,
    label: labelForLocale(preview.locale),
    locale: preview.locale,
  }
}

function parsePlatformPostPreview(
  value: unknown
): ParsedPlatformPostPreview | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const platform = readString(value["platform"])
  if (platform !== "GBP" && platform !== "INSTAGRAM") {
    return undefined
  }

  return {
    aspectRatio: readString(value["aspectRatio"]) ?? "1:1",
    callToAction: readString(value["callToAction"]) ?? "방문 유도",
    copy: readString(value["copy"]) ?? "게시 문구를 다시 생성해주세요.",
    hashtags: readStringArray(value["hashtags"]),
    imageAssetId: readString(value["imageAssetId"]) ?? null,
    label:
      readString(value["label"]) ??
      (platform === "GBP" ? "Google 비즈니스 프로필" : "Instagram 피드"),
    locale: readMarketingLocale(value["locale"]),
    platform,
    translations: readCaptionTranslations(value["translations"]),
    uploadNotes: readStringArray(value["uploadNotes"]),
  }
}

function platformsInOrder(
  previews: readonly ParsedPlatformPostPreview[]
): readonly MarketingPlatform[] {
  const platforms: MarketingPlatform[] = []
  for (const preview of previews) {
    if (!platforms.includes(preview.platform)) {
      platforms.push(preview.platform)
    }
  }
  return platforms
}

function normalizePreviewGroup(
  platform: MarketingPlatform,
  previews: readonly ParsedPlatformPostPreview[],
  koreanCopy: string,
  englishCopy: string
): PlatformPostPreview | undefined {
  const platformPreviews = previews.filter(
    (preview) => preview.platform === platform
  )
  const base =
    platformPreviews.find((preview) => preview.locale === "ko") ??
    platformPreviews[0]
  if (base === undefined) {
    return undefined
  }

  const baseCopy = base.locale === "ko" ? base.copy : koreanCopy
  const legacyTranslations = platformPreviews.flatMap((preview) => {
    const legacy = legacyTranslationFromPreview(preview)
    return legacy === undefined ? [] : [legacy]
  })

  return {
    ...base,
    copy: baseCopy,
    locale: "ko",
    translations: completeTranslations(
      [...base.translations, ...legacyTranslations],
      englishCopy
    ),
  }
}

export function readPlatformPreviews(
  value: unknown,
  koreanCopy: string,
  englishCopy: string
): readonly PlatformPostPreview[] {
  if (!Array.isArray(value)) {
    return []
  }

  const previews = value.flatMap((item) => {
    const preview = parsePlatformPostPreview(item)
    return preview === undefined ? [] : [preview]
  })

  return platformsInOrder(previews).flatMap((platform) => {
    const preview = normalizePreviewGroup(
      platform,
      previews,
      koreanCopy,
      englishCopy
    )
    return preview === undefined ? [] : [preview]
  })
}

export function parseGenerationStatus(value: unknown): string {
  if (!isRecord(value)) {
    return "ready"
  }

  const kind = readString(value["kind"])
  if (kind === "blocked_by_credentials") {
    return "LLM credentials required"
  }
  if (kind === "stub") {
    return "stub"
  }
  return "ready"
}

export function fallbackPlatformPreviews(
  koreanCopy: string,
  englishCopy: string
): readonly PlatformPostPreview[] {
  return [
    {
      aspectRatio: "4:3",
      callToAction: "길찾기",
      copy: koreanCopy,
      hashtags: ["#홍대브런치", "#주말브런치"],
      imageAssetId: null,
      label: "Google 비즈니스 프로필",
      locale: "ko",
      platform: "GBP",
      translations: completeTranslations([], englishCopy),
      uploadNotes: ["매장명 포함"],
    },
  ]
}
