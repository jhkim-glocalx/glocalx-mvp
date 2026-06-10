import { isRecord, readString } from "@/app/_components/json-value"

export const appNavItems = [
  { id: "onboarding", label: "온보딩" },
  { id: "photo", label: "사진 고도화" },
  { id: "posting", label: "다채널 포스팅" },
  { id: "reviews", label: "리뷰 관리" },
  { id: "targets", label: "타겟 국가" },
  { id: "report", label: "성과 리포트" },
  { id: "dashboard", label: "성과 대시보드" },
] as const

export type AppNavId = (typeof appNavItems)[number]["id"]

export type DraftState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly draftId: string
      readonly englishCopy: string
      readonly generationStatus: string
      readonly images: readonly DraftImagePreview[]
      readonly intentAnalysis: DraftIntentAnalysis | null
      readonly kind: "ready"
      readonly koreanCopy: string
      readonly platformPreviews: readonly PlatformPostPreview[]
      readonly suggestion: DraftSuggestion | null
    }
  | { readonly kind: "error"; readonly message: string }

export type MarketingPlatform = "GBP" | "INSTAGRAM"

export type MarketingImageAsset = {
  readonly dataUrl: string
  readonly id: string
  readonly mimeType: "image/jpeg" | "image/png" | "image/webp"
  readonly name: string
  readonly sizeBytes: number
}

export type DraftIntentAnalysis = {
  readonly audience: string
  readonly keywords: readonly string[]
  readonly objective: string
  readonly promotionWindow: string
  readonly tone: string
}

export type DraftImagePreview = {
  readonly altText: string
  readonly assetId: string
  readonly cropFocus: string
  readonly cssFilter: string
  readonly editedDataUrl: string | null
  readonly editedLabel: string
  readonly editSummary: string
  readonly originalLabel: string
  readonly qualityScore: number
}

export type DraftSuggestion = {
  readonly id: string
  readonly message: string
  readonly ownerAction: string
  readonly rationale: string
  readonly revisedIntent: string
  readonly title: string
}

export type PlatformPostPreview = {
  readonly aspectRatio: string
  readonly callToAction: string
  readonly copy: string
  readonly hashtags: readonly string[]
  readonly imageAssetId: string | null
  readonly label: string
  readonly platform: MarketingPlatform
  readonly uploadNotes: readonly string[]
}

export type PublishState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "published"; readonly message: string }
  | { readonly kind: "blocked"; readonly message: string }

export type PerformanceMetric = {
  readonly caption: string
  readonly label: string
  readonly trend: string
  readonly value: number
}

export type PerformanceState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly followUps: readonly string[]
      readonly kind: "ready"
      readonly lastSyncedAt: string
      readonly locationStatus: string
      readonly metrics: readonly PerformanceMetric[]
      readonly periodDays: number
      readonly status: string
      readonly storeName: string
      readonly summary: string
    }
  | { readonly kind: "error"; readonly message: string }

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function parsePerformanceMetric(value: unknown): PerformanceMetric | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const label = readString(value["label"])
  const caption = readString(value["caption"])
  const trend = readString(value["trend"])
  const metricValue = readNumber(value["value"])
  if (
    label === undefined ||
    caption === undefined ||
    trend === undefined ||
    metricValue === undefined
  ) {
    return undefined
  }

  return {
    caption,
    label,
    trend,
    value: metricValue,
  }
}

function readMetricArray(value: unknown): readonly PerformanceMetric[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    const metric = parsePerformanceMetric(item)
    return metric === undefined ? [] : [metric]
  })
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item) => typeof item === "string")
}

function parseIntentAnalysis(value: unknown): DraftIntentAnalysis | null {
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

function readDraftImagePreviews(value: unknown): readonly DraftImagePreview[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    const preview = parseDraftImagePreview(item)
    return preview === undefined ? [] : [preview]
  })
}

function parseDraftSuggestion(value: unknown): DraftSuggestion | null {
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
    title: readString(value["title"]) ?? "스마트 제안",
  }
}

function parsePlatformPostPreview(
  value: unknown
): PlatformPostPreview | undefined {
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
    platform,
    uploadNotes: readStringArray(value["uploadNotes"]),
  }
}

function readPlatformPreviews(value: unknown): readonly PlatformPostPreview[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    const preview = parsePlatformPostPreview(item)
    return preview === undefined ? [] : [preview]
  })
}

function parseGenerationStatus(value: unknown): string {
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

export function isPerformanceNavId(navId: AppNavId): boolean {
  return navId === "report" || navId === "dashboard"
}

export function parseDraftState(payload: unknown): DraftState {
  if (!isRecord(payload)) {
    return { kind: "error", message: "초안 응답을 읽지 못했습니다." }
  }

  const preview = payload["preview"]
  if (!isRecord(preview)) {
    return { kind: "error", message: "초안 미리보기가 없습니다." }
  }

  const platformPreviews = readPlatformPreviews(preview["platformPreviews"])
  const koreanCopy =
    readString(preview["koreanCopy"]) ?? "초안 문구를 다시 생성해주세요."

  return {
    draftId: readString(payload["draftId"]) ?? "draft-id-missing",
    englishCopy: readString(preview["englishCopy"]) ?? "",
    generationStatus: parseGenerationStatus(preview["generationStatus"]),
    images: readDraftImagePreviews(preview["images"]),
    intentAnalysis: parseIntentAnalysis(preview["intentAnalysis"]),
    kind: "ready",
    koreanCopy,
    platformPreviews:
      platformPreviews.length > 0
        ? platformPreviews
        : [
            {
              aspectRatio: "4:3",
              callToAction: "길찾기",
              copy: koreanCopy,
              hashtags: ["#홍대브런치", "#주말브런치"],
              imageAssetId: null,
              label: "Google 비즈니스 프로필",
              platform: "GBP",
              uploadNotes: ["매장명 포함"],
            },
          ],
    suggestion: parseDraftSuggestion(preview["suggestion"]),
  }
}

export function parseGbpPerformanceState(payload: unknown): PerformanceState {
  if (!isRecord(payload)) {
    return {
      kind: "error",
      message: "성과 응답을 읽지 못했습니다.",
    }
  }

  const metrics = readMetricArray(payload["metrics"])
  if (metrics.length === 0) {
    return {
      kind: "error",
      message: "성과 지표가 아직 준비되지 않았습니다.",
    }
  }

  return {
    followUps: readStringArray(payload["followUps"]),
    kind: "ready",
    lastSyncedAt:
      readString(payload["lastSyncedAt"]) ?? "동기화 시간이 없습니다.",
    locationStatus: readString(payload["locationStatus"]) ?? "UNKNOWN",
    metrics,
    periodDays: readNumber(payload["periodDays"]) ?? 30,
    status: readString(payload["status"]) ?? "READY",
    storeName: readString(payload["storeName"]) ?? "브런치모먼트 홍대점",
    summary:
      readString(payload["summary"]) ??
      "최근 Google Business Profile 성과를 확인합니다.",
  }
}

export function parsePublishState(payload: unknown): PublishState {
  if (!isRecord(payload)) {
    return { kind: "blocked", message: "게시 응답을 읽지 못했습니다." }
  }

  const status = readString(payload["status"])
  if (status === "PUBLISHED") {
    return { kind: "published", message: "게시 완료" }
  }

  return {
    kind: "blocked",
    message:
      readString(payload["message"]) ??
      "Google 비즈니스 프로필 상태를 확인해주세요.",
  }
}
