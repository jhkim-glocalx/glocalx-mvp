import {
  toConfirmationState,
  toConfirmedStoreProfilePayload,
  toSetupState,
  type ConfirmationState,
  type SetupState,
  type StoreProfileDraft,
} from "@/app/onboarding/onboarding-model"

export async function requestStoreProfileConfirmation(
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

export async function requestGbpSetupState(): Promise<SetupState> {
  const response = await fetch("/api/gbp/setup", {
    body: JSON.stringify({ mode: "stub" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  const payload: unknown = await response.json()
  return toSetupState(payload)
}
