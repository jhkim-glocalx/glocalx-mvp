import type { MissingStoreProfileField } from "./onboarding-draft-fields"
import { toConversationCandidate } from "./onboarding-conversation-candidate"
import {
  toConfirmationState,
  toConfirmedStoreProfilePayload,
  toExtractionState,
  toOnboardingSlotTurnState,
  toSetupState,
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

export async function requestGbpSetupState(
  reviewToken?: string
): Promise<SetupState> {
  const response = await fetch("/api/gbp/setup", {
    body: JSON.stringify(reviewToken === undefined ? {} : { reviewToken }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  const payload: unknown = await response.json()
  return toSetupState(payload)
}
