import type { StoreProfileDraft } from "./onboarding-model"

export function toConversationCandidate(draft: StoreProfileDraft) {
  return {
    address: draft.address,
    candidateId: draft.candidateId,
    category: draft.category,
    missingFields: draft.missingFields,
    name: draft.name,
    ...(draft.hours.trim() === "" ? {} : { hours: draft.hours }),
    ...(draft.naverPlaceUrl.trim() === ""
      ? {}
      : { naverPlaceUrl: draft.naverPlaceUrl }),
    ...(draft.phone.trim() === "" ? {} : { phone: draft.phone }),
    source: draft.source,
    sourceInput: draft.sourceInput,
  }
}
