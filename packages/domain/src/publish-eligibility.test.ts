import { describe, expect, it } from "vitest"

import { evaluatePublishEligibility } from "./publish-eligibility"

describe("publish eligibility", () => {
  it("allows GBP once the location is verified", () => {
    expect(
      evaluatePublishEligibility("gbp", { gbpLocationStatus: "VERIFIED" })
    ).toEqual({ kind: "eligible" })
  })

  it("distinguishes a missing GBP location from an unverified one", () => {
    expect(evaluatePublishEligibility("gbp", {})).toMatchObject({
      kind: "blocked",
      code: "GBP_LOCATION_MISSING",
    })
    expect(
      evaluatePublishEligibility("gbp", {
        gbpLocationStatus: "VERIFICATION_PENDING",
      })
    ).toMatchObject({ kind: "blocked", code: "GBP_LOCATION_NOT_VERIFIED" })
  })

  it("blocks GBP for every non-verified location status", () => {
    // The same VERIFIED-only rule the owner app applies to live posts — if this
    // ever widens, publishing starts sending posts Google can reject.
    for (const status of [
      "DISCOVERED",
      "CLAIM_REQUIRED",
      "CREATE_REQUESTED",
      "VERIFICATION_PENDING",
      "DUPLICATE",
      "FAILED",
      "MANUAL_FOLLOW_UP",
    ] as const) {
      expect(
        evaluatePublishEligibility("gbp", { gbpLocationStatus: status }).kind
      ).toBe("blocked")
    }
  })

  it("allows Instagram only while the store's link is live", () => {
    expect(
      evaluatePublishEligibility("instagram", {
        instagramLinkStatus: "linked",
      })
    ).toEqual({ kind: "eligible" })
  })

  it("names why an Instagram link cannot publish", () => {
    expect(evaluatePublishEligibility("instagram", {})).toMatchObject({
      kind: "blocked",
      code: "INSTAGRAM_NOT_LINKED",
    })
    expect(
      evaluatePublishEligibility("instagram", {
        instagramLinkStatus: "expired",
      })
    ).toMatchObject({ kind: "blocked", code: "INSTAGRAM_LINK_EXPIRED" })
    expect(
      evaluatePublishEligibility("instagram", {
        instagramLinkStatus: "revoked",
      })
    ).toMatchObject({ kind: "blocked", code: "INSTAGRAM_LINK_REVOKED" })
  })

  it("keeps the two channels' gates independent", () => {
    // A verified GBP location says nothing about Instagram, and vice versa —
    // the publish panel must never let one channel vouch for the other.
    const facts = {
      gbpLocationStatus: "VERIFIED",
      instagramLinkStatus: "revoked",
    } as const

    expect(evaluatePublishEligibility("gbp", facts).kind).toBe("eligible")
    expect(evaluatePublishEligibility("instagram", facts).kind).toBe("blocked")
  })
})
