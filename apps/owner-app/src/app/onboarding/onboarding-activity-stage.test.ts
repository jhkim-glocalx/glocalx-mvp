import { describe, expect, it } from "vitest"

import { onboardingActivityStage } from "./onboarding-activity-stage"
import type { OnboardingStageInput } from "./onboarding-activity-stage"
import type { StoreProfileDraft } from "./onboarding-model"

const draft: StoreProfileDraft = {
  address: "서울 마포구",
  candidateId: "candidate-1",
  category: "카페",
  hours: "09:00-18:00",
  missingFields: [],
  name: "브런치모먼트 홍대점",
  naverPlaceUrl: "",
  phone: "02-000-0000",
  source: "NAVER_LOCAL",
  sourceInput: "브런치모먼트",
}

const idle: OnboardingStageInput = {
  adoption: { kind: "idle" },
  confirmation: { kind: "idle" },
  extraction: { kind: "idle" },
  profileDraft: undefined,
  setup: { kind: "idle" },
  slotCollectionActive: false,
}

describe("onboardingActivityStage", () => {
  it("reports the store input screen before anything has been submitted", () => {
    expect(onboardingActivityStage(idle)).toBe("store_input")
  })

  it("maps the extraction states onto their own stages", () => {
    expect(
      onboardingActivityStage({ ...idle, extraction: { kind: "loading" } })
    ).toBe("extracting")
    expect(
      onboardingActivityStage({
        ...idle,
        extraction: {
          candidates: [draft],
          kind: "candidates",
          message: "",
          requiresSelection: true,
        },
      })
    ).toBe("candidate_selection")
    expect(
      onboardingActivityStage({
        ...idle,
        extraction: { draft, kind: "manual", message: "" },
      })
    ).toBe("manual_entry")
  })

  it("treats slot collection as manual entry", () => {
    expect(
      onboardingActivityStage({ ...idle, slotCollectionActive: true })
    ).toBe("manual_entry")
  })

  it("reports the profile summary once a draft is under confirmation", () => {
    expect(
      onboardingActivityStage({
        ...idle,
        confirmation: { kind: "loading" },
        profileDraft: draft,
      })
    ).toBe("profile_summary")
  })

  // A confirmation with no draft is not a screen the owner can be standing on;
  // it must not shadow the extraction stage they are actually looking at.
  it("ignores a confirmation state with no draft", () => {
    expect(
      onboardingActivityStage({
        ...idle,
        confirmation: { kind: "error", message: "" },
        extraction: { kind: "loading" },
      })
    ).toBe("extracting")
  })

  it("reports access_pending once GBP has been handed off", () => {
    expect(
      onboardingActivityStage({
        ...idle,
        confirmation: { extractionId: "e1", kind: "confirmed", message: "" },
        profileDraft: draft,
        setup: { kind: "pendingReview", message: "" },
      })
    ).toBe("access_pending")
    expect(
      onboardingActivityStage({
        ...idle,
        adoption: { kind: "reviewing", message: "" },
        profileDraft: draft,
      })
    ).toBe("access_pending")
  })
})
