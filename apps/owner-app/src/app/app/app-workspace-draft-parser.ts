import { isRecord, readString } from "@/app/_components/json-value"

import {
  fallbackPlatformPreviews,
  platformPreviewKey,
  parseDraftSuggestion,
  parseGenerationStatus,
  parseIntentAnalysis,
  readDraftImagePreviews,
  readPlatformPreviews,
} from "./app-workspace-draft-preview-parser"
import type {
  DraftState,
  PostingDecisionTurnState,
} from "./app-workspace-draft-types"

export { platformPreviewKey } from "./app-workspace-draft-preview-parser"
export type {
  DraftImagePreview,
  DraftIntentAnalysis,
  DraftState,
  DraftSuggestion,
  MarketingCaptionTranslation,
  MarketingImageAsset,
  MarketingLocale,
  MarketingPlatform,
  MarketingTranslationLocale,
  PlatformPostPreview,
  PostingChatTurn,
  PostingDecisionTurnState,
} from "./app-workspace-draft-types"

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

  const englishCopy = readString(preview["englishCopy"]) ?? ""
  const platformPreviews = readPlatformPreviews(
    preview["platformPreviews"],
    koreanCopy,
    englishCopy
  )

  return {
    draftId,
    englishCopy,
    generationStatus: parseGenerationStatus(preview["generationStatus"]),
    images: readDraftImagePreviews(preview["images"]),
    intentAnalysis: parseIntentAnalysis(preview["intentAnalysis"]),
    kind: "ready",
    koreanCopy,
    platformPreviews:
      // Core copy is enough for a GBP preview when malformed LLM preview arrays are omitted.
      platformPreviews.length > 0
        ? platformPreviews
        : fallbackPlatformPreviews(koreanCopy, englishCopy),
    suggestion: parseDraftSuggestion(preview["suggestion"]),
  }
}

export function previewKeyForDraft(draft: DraftState): string {
  if (draft.kind !== "ready") {
    return "GBP"
  }
  const firstPreview = draft.platformPreviews[0]
  return firstPreview === undefined ? "GBP" : platformPreviewKey(firstPreview)
}

export function parsePostingDecisionTurnState(
  payload: unknown
): PostingDecisionTurnState {
  if (!isRecord(payload)) {
    return { kind: "error", message: "제안 응답을 읽지 못했습니다." }
  }

  const status = readString(payload["status"])
  if (status !== "POSTING_CONVERSATION_TURN") {
    // Server blocks can still carry useful assistant text, so preserve it before generic fallback.
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
    // A malformed replacement draft must surface as draft failure, not a successful chat turn.
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
