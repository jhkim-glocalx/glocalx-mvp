import type { ExtractionState, StoreProfileDraft } from "./onboarding-model"

export function selectedDraftFromExtraction(
  extraction: ExtractionState
): StoreProfileDraft | undefined {
  switch (extraction.kind) {
    case "candidates":
      return undefined
    case "manual":
      return extraction.draft
    case "error":
    case "idle":
    case "loading":
    case "searchQueryRequired":
      return undefined
  }
}
