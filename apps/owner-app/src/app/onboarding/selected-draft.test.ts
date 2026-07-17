import { describe, expect, it } from "vitest"

import { selectedDraftFromExtraction } from "./selected-draft"
import type { ExtractionState, StoreProfileDraft } from "./onboarding-model"

const naverDraft = {
  candidateId: "candidate-1",
  source: "NAVER_LOCAL",
  sourceInput: "브런치모먼트",
  name: "브런치모먼트 홍대점",
  address: "서울 마포구 와우산로 123",
  phone: "02-1234-5678",
  category: "브런치 카페",
  hours: "",
  naverPlaceUrl: "https://naver.me/store",
  missingFields: ["hours"],
} satisfies StoreProfileDraft

describe("selected draft from extraction", () => {
  it("keeps a single Naver candidate pending until the owner confirms it", () => {
    // Given
    const extraction = {
      candidates: [naverDraft],
      kind: "candidates",
      message: "네이버에서 매장 정보를 찾았습니다.",
      requiresSelection: false,
    } satisfies ExtractionState

    // When
    const selectedDraft = selectedDraftFromExtraction(extraction)

    // Then
    expect(selectedDraft).toBeUndefined()
  })

  it("selects manual drafts immediately because they are owner-authored", () => {
    // Given
    const extraction = {
      draft: { ...naverDraft, source: "MANUAL" },
      kind: "manual",
      message: "직접 입력으로 계속할 수 있습니다.",
    } satisfies ExtractionState

    // When
    const selectedDraft = selectedDraftFromExtraction(extraction)

    // Then
    expect(selectedDraft).toEqual(extraction.draft)
  })
})
