import { describe, expect, it } from "vitest"

import { isStoreProfileConfirmationMessage } from "./onboarding-copy"

describe("onboarding confirmation copy", () => {
  it("accepts short Korean agreement replies as store profile confirmation", () => {
    // Given
    const ownerReplies = ["예", "네", "맞아요", "네, 맞아요"] as const

    // When
    const results = ownerReplies.map((reply) =>
      isStoreProfileConfirmationMessage(reply)
    )

    // Then
    expect(results).toEqual([true, true, true, true])
  })

  it("does not treat arbitrary owner text as store profile confirmation", () => {
    // Given
    const ownerMessage = "전화번호는 02-1234-5678이에요"

    // When
    const result = isStoreProfileConfirmationMessage(ownerMessage)

    // Then
    expect(result).toBe(false)
  })
})
