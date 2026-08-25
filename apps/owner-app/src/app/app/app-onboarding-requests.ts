import {
  toConfirmationState,
  toConfirmedStoreProfilePayload,
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

// Final GBP submission is an admin dashboard action now — see the matching
// function in onboarding-requests.ts for why this no longer calls the server.
export async function requestGbpSetupState(): Promise<SetupState> {
  return {
    kind: "pendingReview",
    message:
      "매장 정보 확인이 완료되었습니다. 운영자가 확인 후 Google 비즈니스 프로필을 등록해드립니다.",
  }
}
