import { describe, expect, it } from "vitest"

import {
  gbpVerificationOwnerPhase,
  interpretGbpVerificationState,
  parseVerificationOptionMethods,
} from "./gbp-verification-state"

describe("interpretGbpVerificationState", () => {
  it("returns UNKNOWN when the voice-of-merchant state could not be read", () => {
    expect(
      interpretGbpVerificationState({
        voiceOfMerchant: undefined,
        offeredMethods: [],
      })
    ).toBe("UNKNOWN")
  })

  it("returns VERIFIED when Google has granted voice of merchant", () => {
    expect(
      interpretGbpVerificationState({
        voiceOfMerchant: { hasVoiceOfMerchant: true },
        offeredMethods: [],
      })
    ).toBe("VERIFIED")
  })

  it("returns PENDING_REVIEW while Google reviews an accepted verification", () => {
    // The state right after a verify(AUTO) that Google accepted but has not yet
    // ruled on — no owner action helps, so it must not read as needs-verification.
    expect(
      interpretGbpVerificationState({
        voiceOfMerchant: {
          hasVoiceOfMerchant: false,
          waitForVoiceOfMerchant: {},
        },
        offeredMethods: [],
      })
    ).toBe("PENDING_REVIEW")
  })

  it("returns NEEDS_VERIFICATION when an API-drivable method is offered", () => {
    expect(
      interpretGbpVerificationState({
        voiceOfMerchant: { hasVoiceOfMerchant: false, verify: {} },
        offeredMethods: ["ADDRESS", "AUTO"],
      })
    ).toBe("NEEDS_VERIFICATION")
  })

  it("returns NEEDS_CONCIERGE when verification is required but no API method exists", () => {
    // The reverted state from the live probe: verify required, zero API methods —
    // only Google's UI/video flow remains, which the API cannot drive.
    expect(
      interpretGbpVerificationState({
        voiceOfMerchant: { hasVoiceOfMerchant: false, verify: {} },
        offeredMethods: [],
      })
    ).toBe("NEEDS_CONCIERGE")
  })

  it("treats an AUTO-only offer as a concierge case (AUTO is not owner-drivable)", () => {
    expect(
      interpretGbpVerificationState({
        voiceOfMerchant: { hasVoiceOfMerchant: false, verify: {} },
        offeredMethods: ["AUTO"],
      })
    ).toBe("NEEDS_CONCIERGE")
  })
})

describe("parseVerificationOptionMethods", () => {
  it("extracts the verification method enums from a Google response", () => {
    expect(
      parseVerificationOptionMethods({
        options: [
          { verificationMethod: "ADDRESS", addressData: {} },
          { verificationMethod: "PHONE_CALL", phoneNumber: "+82..." },
        ],
      })
    ).toEqual(["ADDRESS", "PHONE_CALL"])
  })

  it("returns an empty list for a zero-method (UI/video-only) response", () => {
    expect(parseVerificationOptionMethods({ options: [] })).toEqual([])
  })

  it("returns an empty list rather than throwing on a malformed body", () => {
    expect(parseVerificationOptionMethods("not-json")).toEqual([])
    expect(parseVerificationOptionMethods(undefined)).toEqual([])
  })
})

describe("gbpVerificationOwnerPhase", () => {
  it("maps the five internal states to the three owner-facing phases", () => {
    expect(gbpVerificationOwnerPhase("VERIFIED")).toBe("verified")
    expect(gbpVerificationOwnerPhase("PENDING_REVIEW")).toBe("in_progress")
    expect(gbpVerificationOwnerPhase("UNKNOWN")).toBe("in_progress")
    // No owner-driven PIN UI yet, so both "needs" states route to the operator.
    expect(gbpVerificationOwnerPhase("NEEDS_VERIFICATION")).toBe("attention")
    expect(gbpVerificationOwnerPhase("NEEDS_CONCIERGE")).toBe("attention")
  })
})
