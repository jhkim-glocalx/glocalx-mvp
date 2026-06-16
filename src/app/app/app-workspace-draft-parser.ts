import {
  isRecord,
  readString,
  readStringArray,
} from "@/app/_components/json-value"

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

export type PostingChatTurn = {
  readonly id: string
  readonly message: string
  readonly speaker: "assistant" | "owner"
}

export type PostingDecisionTurnState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly assistantMessage: string
      readonly decision: string
      readonly draft: DraftState | null
      readonly kind: "ready"
      readonly revisedIntent: string | null
      readonly sessionId: string
    }
  | { readonly kind: "error"; readonly message: string }

export type MarketingPlatform = "GBP" | "INSTAGRAM"

export type MarketingImageAsset = {
  readonly dataUrl: string
  readonly id: string
  readonly mimeType: "image/jpeg" | "image/png" | "image/webp"
  readonly name: string
  readonly requestDataUrl?: string
  readonly requestMimeType?: "image/jpeg"
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

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
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

function fallbackPlatformPreview(koreanCopy: string): PlatformPostPreview {
  return {
    aspectRatio: "4:3",
    callToAction: "길찾기",
    copy: koreanCopy,
    hashtags: ["#홍대브런치", "#주말브런치"],
    imageAssetId: null,
    label: "Google 비즈니스 프로필",
    platform: "GBP",
    uploadNotes: ["매장명 포함"],
  }
}

export function parseDraftState(payload: unknown): DraftState {
  if (!isRecord(payload)) {
    return { kind: "error", message: "초안 응답을 읽지 못했습니다." }
  }

  const status = readString(payload["status"])
  if (status !== "DRAFT_READY") {
    return {
      kind: "error",
      message:
        readString(payload["message"]) ?? "초안 생성이 완료되지 않았습니다.",
    }
  }

  const draftId = readString(payload["draftId"])
  if (draftId === undefined) {
    return { kind: "error", message: "초안 식별자가 없습니다." }
  }

  const preview = payload["preview"]
  if (!isRecord(preview)) {
    return { kind: "error", message: "초안 미리보기가 없습니다." }
  }

  const koreanCopy = readString(preview["koreanCopy"])
  if (koreanCopy === undefined) {
    return { kind: "error", message: "초안 문구가 없습니다." }
  }

  const platformPreviews = readPlatformPreviews(preview["platformPreviews"])

  return {
    draftId,
    englishCopy: readString(preview["englishCopy"]) ?? "",
    generationStatus: parseGenerationStatus(preview["generationStatus"]),
    images: readDraftImagePreviews(preview["images"]),
    intentAnalysis: parseIntentAnalysis(preview["intentAnalysis"]),
    kind: "ready",
    koreanCopy,
    platformPreviews:
      platformPreviews.length > 0
        ? platformPreviews
        : [fallbackPlatformPreview(koreanCopy)],
    suggestion: parseDraftSuggestion(preview["suggestion"]),
  }
}

export function parsePostingDecisionTurnState(
  payload: unknown
): PostingDecisionTurnState {
  if (!isRecord(payload)) {
    return { kind: "error", message: "제안 응답을 읽지 못했습니다." }
  }

  const status = readString(payload["status"])
  if (status !== "POSTING_CONVERSATION_TURN") {
    return {
      kind: "error",
      message:
        readString(payload["assistantMessage"]) ??
        readString(payload["message"]) ??
        "AI 제안 응답 처리에 실패했습니다.",
    }
  }

  const assistantMessage = readString(payload["assistantMessage"])
  const decision = readString(payload["decision"])
  const sessionId = readString(payload["sessionId"])
  if (
    assistantMessage === undefined ||
    decision === undefined ||
    sessionId === undefined
  ) {
    return { kind: "error", message: "제안 응답 형식이 올바르지 않습니다." }
  }

  const parsedDraft =
    payload["draft"] === undefined ? null : parseDraftState(payload["draft"])
  if (parsedDraft?.kind === "error") {
    return parsedDraft
  }

  return {
    assistantMessage,
    decision,
    draft: parsedDraft,
    kind: "ready",
    revisedIntent: readString(payload["revisedIntent"]) ?? null,
    sessionId,
  }
}
