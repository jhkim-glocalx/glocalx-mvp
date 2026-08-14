import { describe, expect, it } from "vitest"

import { isValidGoogleOAuthCallback } from "./oauth-callback"

describe("isValidGoogleOAuthCallback", () => {
  it("accepts a callback whose state matches the state cookie", () => {
    // Given / When
    const isValid = isValidGoogleOAuthCallback({
      code: "google-auth-code",
      expectedState: "demo-store:google-oauth-state",
      state: "demo-store:google-oauth-state",
    })

    // Then
    expect(isValid).toBe(true)
  })

  it("rejects a tampered state", () => {
    // Given / When
    const isValid = isValidGoogleOAuthCallback({
      code: "google-auth-code",
      expectedState: "demo-store:google-oauth-state",
      state: "tampered-state",
    })

    // Then
    expect(isValid).toBe(false)
  })

  it("rejects blank states so a missing state cookie never matches a missing query param", () => {
    // Given / When
    const isValid = isValidGoogleOAuthCallback({
      code: "google-auth-code",
      expectedState: "",
      state: "",
    })

    // Then
    expect(isValid).toBe(false)
  })

  it("rejects a matching state without an authorization code", () => {
    // Given / When
    const isValid = isValidGoogleOAuthCallback({
      code: "   ",
      expectedState: "demo-store:google-oauth-state",
      state: "demo-store:google-oauth-state",
    })

    // Then
    expect(isValid).toBe(false)
  })
})
