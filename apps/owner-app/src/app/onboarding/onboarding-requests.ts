import type { MissingStoreProfileField } from "./onboarding-draft-fields"
import { toConversationCandidate } from "./onboarding-conversation-candidate"
import {
  toAdoptionState,
  toConfirmationState,
  toConfirmedStoreProfilePayload,
  toExtractionState,
  toOnboardingSlotTurnState,
  type AdoptionState,
  type ConfirmationState,
  type ExtractionState,
  type OnboardingSlotTurnState,
  type StoreProfileDraft,
  type SetupState,
} from "./onboarding-model"

export async function requestExtractionState(
  nextInput: string
): Promise<ExtractionState> {
  const response = await fetch("/api/onboarding/extractions", {
    body: JSON.stringify({ input: nextInput }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  const payload: unknown = await response.json()
  return toExtractionState(payload, nextInput)
}

export async function requestOnboardingSlotTurnState({
  clientEventId,
  ownerMessage,
  profileDraft,
  requestedField,
  slotSessionId,
}: {
  readonly clientEventId: string
  readonly ownerMessage: string
  readonly profileDraft: StoreProfileDraft
  readonly requestedField: MissingStoreProfileField
  readonly slotSessionId: string | undefined
}): Promise<OnboardingSlotTurnState> {
  const response = await fetch("/api/onboarding/conversation/slots", {
    body: JSON.stringify({
      candidate: toConversationCandidate(profileDraft),
      clientEventId,
      currentState:
        profileDraft.source === "MANUAL"
          ? "manual_collection"
          : slotSessionId === undefined
            ? "slot_elicitation"
            : "slot_clarification",
      ...(slotSessionId === undefined ? {} : { sessionId: slotSessionId }),
      ownerMessage,
      requestedField,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  const payload: unknown = await response.json()
  return toOnboardingSlotTurnState(payload)
}

export async function requestStoreProfileConfirmationState(
  profileDraft: StoreProfileDraft
): Promise<ConfirmationState> {
  const response = await fetch("/api/onboarding/store-profile/confirm", {
    body: JSON.stringify(toConfirmedStoreProfilePayload(profileDraft)),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  const payload: unknown = await response.json()
  return toConfirmationState(payload)
}

export async function requestGbpAdoptionState(): Promise<AdoptionState> {
  const response = await fetch("/api/gbp/adoption", {
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  const payload: unknown = await response.json()
  return toAdoptionState(payload)
}

// Final GBP submission is an admin dashboard action now (the Stores
// console's "제출 대기" section runs the same setup service on the
// operator's word) — this no longer calls Google, or even the server, at
// all. The confirmed store profile from handleConfirmation already makes
// the store visible there.
export async function requestGbpSetupState(): Promise<SetupState> {
  return {
    kind: "pendingReview",
    message:
      "매장 정보 확인이 완료되었습니다. 운영자가 확인 후 Google 비즈니스 프로필을 등록해드립니다.",
  }
}
