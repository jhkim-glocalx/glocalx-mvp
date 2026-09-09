import type { ActivityStage } from "@glocalx/domain/support/contracts"

import type {
  AdoptionState,
  ConfirmationState,
  ExtractionState,
  SetupState,
  StoreProfileDraft,
} from "./onboarding-model"

export type OnboardingStageInput = {
  readonly adoption: AdoptionState
  readonly confirmation: ConfirmationState
  readonly extraction: ExtractionState
  readonly profileDraft: StoreProfileDraft | undefined
  readonly setup: SetupState
  readonly slotCollectionActive: boolean
}

// Where the owner is standing when they open support chat, in the closed stage
// vocabulary the operator console already labels (activity.ts activityStages).
// Onboarding screens stack on one scroll surface, so "current stage" is the
// most advanced state reached — checked back-to-front — not the last one the
// owner touched.
export function onboardingActivityStage(
  state: OnboardingStageInput
): ActivityStage {
  if (state.adoption.kind === "reviewing" || state.setup.kind !== "idle") {
    return "access_pending"
  }
  if (state.confirmation.kind !== "idle" && state.profileDraft !== undefined) {
    return "profile_summary"
  }
  if (state.slotCollectionActive || state.extraction.kind === "manual") {
    return "manual_entry"
  }
  if (state.extraction.kind === "candidates") {
    return "candidate_selection"
  }
  if (state.extraction.kind === "loading") {
    return "extracting"
  }
  return "store_input"
}
