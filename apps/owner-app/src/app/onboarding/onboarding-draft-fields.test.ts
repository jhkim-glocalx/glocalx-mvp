import { describe, expect, it } from "vitest"

import { updateStoreProfileDraftField } from "./onboarding-draft-fields"
import type { StoreProfileDraft } from "./onboarding-model"

const draftWithMissingFields = {
  candidateId: "candidate-1",
  source: "NAVER_LOCAL",
  sourceInput: "https://naver.me/store",
  name: "브런치모먼트 홍대점",
  address: "서울 마포구 와우산로 123",
  phone: "",
  category: "브런치 카페",
  hours: "",
  naverPlaceUrl: "https://naver.me/store",
  missingFields: ["phone", "hours"],
} satisfies StoreProfileDraft

describe("onboarding draft field updates", () => {
  it("clears a missing phone slot when the form field is filled", () => {
    // Given
    const draft = draftWithMissingFields

    // When
    const nextDraft = updateStoreProfileDraftField(
      draft,
      "phone",
      "02-1234-5678"
    )

    // Then
    expect(nextDraft.phone).toBe("02-1234-5678")
    expect(nextDraft.missingFields).toEqual(["hours"])
  })

  it("restores a missing hours slot when the form field is cleared", () => {
    // Given
    const draft = {
      ...draftWithMissingFields,
      hours: "평일 09:00-18:00",
      missingFields: ["phone"],
    } satisfies StoreProfileDraft

    // When
    const nextDraft = updateStoreProfileDraftField(draft, "hours", "")

    // Then
    expect(nextDraft.hours).toBe("")
    expect(nextDraft.missingFields).toEqual(["phone", "hours"])
  })
})
