import {
  isRecord,
  readString,
  readStringArray,
} from "@/app/_components/json-value"
import type { ConfirmedStoreProfile } from "@/domain/schemas"

export type StoreProfileSource = "NAVER_LOCAL" | "MANUAL"

export type StoreProfileDraft = {
  readonly candidateId: string
  readonly source: StoreProfileSource
  readonly sourceInput: string
  readonly name: string
  readonly address: string
  readonly phone: string
  readonly category: string
  readonly hours: string
  readonly naverPlaceUrl: string
  readonly missingFields: readonly string[]
}

export type ExtractionState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly candidates: readonly StoreProfileDraft[]
      readonly kind: "candidates"
      readonly message: string
      readonly requiresSelection: boolean
    }
  | {
      readonly draft: StoreProfileDraft
      readonly kind: "manual"
      readonly message: string
    }
  | { readonly kind: "searchQueryRequired"; readonly message: string }
  | { readonly kind: "error"; readonly message: string }

export type ConfirmationState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly extractionId: string
      readonly kind: "confirmed"
      readonly message: string
    }
  | { readonly kind: "error"; readonly message: string }

export type SetupState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly apiStatus: string
      readonly auditLogId: string
      readonly followUpJobId: string
      readonly kind: "ready"
      readonly message: string
    }
  | {
      readonly apiStatus: string
      readonly kind: "claimRequired"
      readonly message: string
      readonly requestAdminRightsUrl: string
    }
  | { readonly kind: "error"; readonly message: string }

export type OnboardingChatTurn = {
  readonly id: string
  readonly message: string
  readonly speaker: "assistant" | "owner"
}

export type OnboardingSlotTurnState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly assistantMessage: string
      readonly draft: StoreProfileDraft
      readonly kind: "ready"
      readonly needsOwnerConfirmation: boolean
      readonly nextState: string
      readonly sessionId: string
    }
  | { readonly kind: "error"; readonly message: string }

function readCandidate(payload: unknown): StoreProfileDraft | undefined {
  if (!isRecord(payload)) {
    return undefined
  }

  const candidateId = readString(payload["candidateId"])
  const source = readString(payload["source"])
  const sourceInput = readString(payload["sourceInput"])
  const name = readString(payload["name"])
  const address = readString(payload["address"])
  const category = readString(payload["category"])
  if (
    candidateId === undefined ||
    sourceInput === undefined ||
    name === undefined ||
    address === undefined ||
    category === undefined ||
    (source !== "NAVER_LOCAL" && source !== "MANUAL")
  ) {
    return undefined
  }

  return {
    candidateId,
    source,
    sourceInput,
    name,
    address,
    category,
    phone: readString(payload["phone"]) ?? "",
    hours: readString(payload["hours"]) ?? "",
    naverPlaceUrl: readString(payload["naverPlaceUrl"]) ?? "",
    missingFields: readStringArray(payload["missingFields"]),
  }
}

export function manualDraft(sourceInput: string): StoreProfileDraft {
  return {
    candidateId: "manual-candidate",
    source: "MANUAL",
    sourceInput,
    name: "",
    address: "",
    phone: "",
    category: "",
    hours: "",
    naverPlaceUrl: "",
    missingFields: ["phone", "hours"],
  }
}

export function toExtractionState(
  payload: unknown,
  sourceInput: string
): ExtractionState {
  if (!isRecord(payload)) {
    return { kind: "error", message: "응답을 읽지 못했습니다." }
  }

  const status = readString(payload["status"])
  if (status === "SEARCH_QUERY_REQUIRED") {
    const retrievalError = payload["retrievalError"]
    const message = isRecord(retrievalError)
      ? readString(retrievalError["message"])
      : undefined
    return {
      kind: "searchQueryRequired",
      message:
        message ??
        "네이버 링크에서 가게 이름을 읽지 못했습니다. 가게 이름을 입력해주세요.",
    }
  }

  if (status === "MANUAL_INPUT_REQUIRED") {
    return {
      draft: manualDraft(sourceInput),
      kind: "manual",
      message:
        readString(payload["message"]) ??
        "네이버에서 매장을 찾지 못했습니다. 직접 입력으로 계속할 수 있습니다.",
    }
  }

  const candidates = Array.isArray(payload["candidates"])
    ? payload["candidates"].flatMap((candidate) => {
        const parsedCandidate = readCandidate(candidate)
        return parsedCandidate === undefined ? [] : [parsedCandidate]
      })
    : []
  if (status === "CANDIDATES_FOUND" && candidates.length > 0) {
    return {
      candidates,
      kind: "candidates",
      message:
        readString(payload["message"]) ?? "네이버에서 매장 정보를 찾았습니다.",
      requiresSelection: payload["requiresSelection"] === true,
    }
  }

  return { kind: "error", message: "가게 정보를 찾지 못했습니다." }
}

export function toConfirmedStoreProfilePayload(
  draft: StoreProfileDraft
): ConfirmedStoreProfile {
  return {
    source: draft.source,
    sourceInput: draft.sourceInput,
    name: draft.name,
    address: draft.address,
    category: draft.category,
    phone: draft.phone,
    ...(draft.hours.trim() === "" ? {} : { hours: draft.hours }),
    ...(draft.naverPlaceUrl.trim() === ""
      ? {}
      : { naverPlaceUrl: draft.naverPlaceUrl }),
  }
}

export function toConfirmationState(payload: unknown): ConfirmationState {
  if (!isRecord(payload)) {
    return { kind: "error", message: "매장 정보 확인 응답을 읽지 못했습니다." }
  }

  if (readString(payload["status"]) !== "CONFIRMED") {
    return {
      kind: "error",
      message:
        readString(payload["message"]) ?? "매장 정보 확인에 실패했습니다.",
    }
  }

  return {
    extractionId:
      readString(payload["extractionId"]) ?? "extraction-id-missing",
    kind: "confirmed",
    message:
      readString(payload["message"]) ??
      "매장 정보를 확인했습니다. GBP 세팅을 진행할 수 있습니다.",
  }
}

export function toSetupState(payload: unknown): SetupState {
  if (!isRecord(payload)) {
    return { kind: "error", message: "GBP 세팅 응답을 읽지 못했습니다." }
  }

  const status = readString(payload["status"]) ?? "UNKNOWN"
  if (status === "CLAIM_REQUIRED") {
    return {
      apiStatus: status,
      kind: "claimRequired",
      message:
        readString(payload["message"]) ??
        "이미 소유자가 있는 Google 비즈니스 프로필입니다.",
      requestAdminRightsUrl:
        readString(payload["requestAdminRightsUrl"]) ?? "url-missing",
    }
  }

  if (status === "STORE_PROFILE_REQUIRED" || status === "AUTH_REQUIRED") {
    return {
      kind: "error",
      message:
        readString(payload["message"]) ?? "GBP 세팅을 진행할 수 없습니다.",
    }
  }

  return {
    apiStatus: status,
    auditLogId: readString(payload["auditLogId"]) ?? "audit-id-missing",
    followUpJobId: readString(payload["followUpJobId"]) ?? "job-id-missing",
    kind: "ready",
    message:
      readString(payload["message"]) ??
      "GBP 세팅 상태를 확인했어요. 대시보드에서 다음 작업을 이어갈 수 있어요.",
  }
}

export function toOnboardingSlotTurnState(
  payload: unknown
): OnboardingSlotTurnState {
  if (!isRecord(payload)) {
    return { kind: "error", message: "대화 응답을 읽지 못했습니다." }
  }

  const status = readString(payload["status"])
  if (status !== "ONBOARDING_CONVERSATION_TURN") {
    return {
      kind: "error",
      message:
        readString(payload["assistantMessage"]) ??
        readString(payload["message"]) ??
        "AI 매장 정보 확인에 실패했습니다.",
    }
  }

  const assistantMessage = readString(payload["assistantMessage"])
  const draft = readCandidate(payload["draft"])
  const nextState = readString(payload["nextState"])
  const sessionId = readString(payload["sessionId"])
  if (
    assistantMessage === undefined ||
    draft === undefined ||
    nextState === undefined ||
    sessionId === undefined
  ) {
    return { kind: "error", message: "대화 응답 형식이 올바르지 않습니다." }
  }

  return {
    assistantMessage,
    draft,
    kind: "ready",
    needsOwnerConfirmation: payload["needsOwnerConfirmation"] === true,
    nextState,
    sessionId,
  }
}
