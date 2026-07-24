import { describe, expect, it } from "vitest"

import {
  evaluateOrgCredentialState,
  orgCredentialExpiryGraceSeconds,
  orgCredentialProviders,
  saveOrgCredentialRequestSchema,
} from "./org-credentials"

const now = new Date("2026-07-24T12:00:00.000Z")

function expiringIn(seconds: number) {
  return {
    kind: "found",
    accessToken: "org-token",
    expiresAt: new Date(now.getTime() + seconds * 1000),
  } as const
}

const usable = { kind: "usable", accessToken: "org-token" }

describe("org credential state", () => {
  it("blocks when no credential is configured", () => {
    expect(evaluateOrgCredentialState({ kind: "missing" }, now)).toMatchObject({
      kind: "blocked",
      code: "ORG_CREDENTIAL_MISSING",
    })
  })

  it("distinguishes an unreadable credential from a missing one", () => {
    // A rotated TOKEN_ENCRYPTION_KEY is an entirely different operator fix than
    // never having pasted a credential; collapsing them sends ops the wrong way.
    expect(
      evaluateOrgCredentialState({ kind: "undecryptable" }, now)
    ).toMatchObject({
      kind: "blocked",
      code: "ORG_CREDENTIAL_UNREADABLE",
    })
  })

  it("treats a credential with no expiry as usable", () => {
    // Distinct from an expiry that has already passed — a Meta app token simply
    // never reports one.
    expect(
      evaluateOrgCredentialState(
        { kind: "found", accessToken: "org-token", expiresAt: null },
        now
      )
    ).toEqual(usable)
  })

  it("only yields the token through the usable verdict", () => {
    // The gate is the sole way out: an expired credential returns a message and
    // no token, so no caller can publish with one it did not check.
    const blocked = evaluateOrgCredentialState(expiringIn(-1), now)
    expect(blocked).not.toHaveProperty("accessToken")
    expect(evaluateOrgCredentialState(expiringIn(3600), now)).toHaveProperty(
      "accessToken",
      "org-token"
    )
  })

  it("blocks a credential whose expiry has passed", () => {
    expect(evaluateOrgCredentialState(expiringIn(-1), now)).toMatchObject({
      kind: "blocked",
      code: "ORG_CREDENTIAL_EXPIRED",
    })
  })

  it("allows a credential comfortably inside its lifetime", () => {
    expect(evaluateOrgCredentialState(expiringIn(3600), now)).toEqual(usable)
  })

  it("blocks inside the grace window rather than letting it expire mid-call", () => {
    // The whole point of the grace: a token with seconds left would otherwise be
    // handed to a channel call that outlives it, turning a clear "re-link this"
    // into an opaque provider error.
    expect(
      evaluateOrgCredentialState(
        expiringIn(orgCredentialExpiryGraceSeconds - 1),
        now
      )
    ).toMatchObject({ kind: "blocked", code: "ORG_CREDENTIAL_EXPIRED" })
    expect(
      evaluateOrgCredentialState(
        expiringIn(orgCredentialExpiryGraceSeconds + 1),
        now
      )
    ).toEqual(usable)
  })
})

describe("providers", () => {
  it("exposes both providers for the settings panel", () => {
    expect(orgCredentialProviders).toEqual(["google_org", "meta_app"])
  })
})

describe("save org credential request schema", () => {
  const validPayload = {
    provider: "google_org",
    token: "paste-value",
  }

  it("accepts a minimal payload", () => {
    expect(saveOrgCredentialRequestSchema.parse(validPayload)).toMatchObject({
      provider: "google_org",
    })
  })

  it("accepts optional expiry, refresh token and scopes", () => {
    const parsed = saveOrgCredentialRequestSchema.parse({
      ...validPayload,
      refreshToken: "paste-refresh",
      expiresAt: "2026-08-01T00:00:00.000Z",
      scopes: "https://www.googleapis.com/auth/business.manage",
    })
    expect(parsed.expiresAt).toBe("2026-08-01T00:00:00.000Z")
  })

  it("rejects an unknown provider and an empty token", () => {
    expect(
      saveOrgCredentialRequestSchema.safeParse({
        ...validPayload,
        provider: "some_other_provider",
      }).success
    ).toBe(false)
    expect(
      saveOrgCredentialRequestSchema.safeParse({
        ...validPayload,
        token: "   ",
      }).success
    ).toBe(false)
  })

  it("rejects unknown fields so a stray secret can't ride along", () => {
    expect(
      saveOrgCredentialRequestSchema.safeParse({
        ...validPayload,
        clientSecret: "should-not-be-accepted",
      }).success
    ).toBe(false)
  })

  it("rejects a non-ISO expiry", () => {
    expect(
      saveOrgCredentialRequestSchema.safeParse({
        ...validPayload,
        expiresAt: "next tuesday",
      }).success
    ).toBe(false)
  })
})
