import { describe, expect, it } from "vitest"

import {
  type GbpAccessState,
  InvalidGbpAccessTransitionError,
  gbpAccessOwnerPhase,
  gbpAccessStates,
  transitionGbpAccess,
} from "./gbp-access.ts"

describe("transitionGbpAccess", () => {
  it("walks the natural onboarding path not_requested → invited → pending → granted", () => {
    expect(transitionGbpAccess("not_requested", { type: "SEND_INVITE" })).toBe(
      "invited"
    )
    expect(transitionGbpAccess("invited", { type: "MARK_PENDING" })).toBe(
      "pending"
    )
    expect(transitionGbpAccess("pending", { type: "GRANT" })).toBe("granted")
  })

  it("lets GRANT collapse the pending hop when the owner grants straight from invited", () => {
    expect(transitionGbpAccess("invited", { type: "GRANT" })).toBe("granted")
  })

  it("treats blocked as a recoverable source for each forward step", () => {
    expect(transitionGbpAccess("blocked", { type: "SEND_INVITE" })).toBe(
      "invited"
    )
    expect(transitionGbpAccess("blocked", { type: "MARK_PENDING" })).toBe(
      "pending"
    )
    expect(transitionGbpAccess("blocked", { type: "GRANT" })).toBe("granted")
  })

  it("blocks only from active working states", () => {
    expect(transitionGbpAccess("not_requested", { type: "BLOCK" })).toBe(
      "blocked"
    )
    expect(transitionGbpAccess("invited", { type: "BLOCK" })).toBe("blocked")
    expect(transitionGbpAccess("pending", { type: "BLOCK" })).toBe("blocked")
  })

  it("confirms an owner-claimed adoption straight to granted, skipping the invite hop", () => {
    expect(
      transitionGbpAccess("adoption_review", { type: "CONFIRM_ADOPTION" })
    ).toBe("granted")
    expect(transitionGbpAccess("blocked", { type: "CONFIRM_ADOPTION" })).toBe(
      "granted"
    )
  })

  it("parks a rejected adoption in blocked so nothing resumes without an operator", () => {
    expect(
      transitionGbpAccess("adoption_review", {
        type: "REJECT_ADOPTION",
        reason: "저희 계정에서 찾지 못했어요.",
      })
    ).toBe("blocked")
    expect(gbpAccessOwnerPhase("blocked")).toBe("attention")
  })

  it("refuses an adoption verdict where there is no claim to rule on", () => {
    for (const state of ["not_requested", "invited", "pending"] as const) {
      expect(() =>
        transitionGbpAccess(state, {
          type: "REJECT_ADOPTION",
          reason: "저희 계정에서 찾지 못했어요.",
        })
      ).toThrow(InvalidGbpAccessTransitionError)
      expect(() =>
        transitionGbpAccess(state, { type: "CONFIRM_ADOPTION" })
      ).toThrow(InvalidGbpAccessTransitionError)
    }
  })

  it("shows an adoption awaiting an operator as ordinary progress to the owner", () => {
    expect(gbpAccessOwnerPhase("adoption_review")).toBe("in_progress")
  })

  it("revokes only a granted request", () => {
    expect(transitionGbpAccess("granted", { type: "REVOKE" })).toBe("revoked")
  })

  it("rejects an incoherent forward jump with a typed error", () => {
    expect(() =>
      transitionGbpAccess("not_requested", { type: "GRANT" })
    ).toThrow(InvalidGbpAccessTransitionError)
    expect(() =>
      transitionGbpAccess("not_requested", { type: "MARK_PENDING" })
    ).toThrow(InvalidGbpAccessTransitionError)
  })

  it("refuses to revoke or block a settled request", () => {
    expect(() =>
      transitionGbpAccess("not_requested", { type: "REVOKE" })
    ).toThrow(InvalidGbpAccessTransitionError)
    expect(() => transitionGbpAccess("granted", { type: "BLOCK" })).toThrow(
      InvalidGbpAccessTransitionError
    )
    expect(() => transitionGbpAccess("revoked", { type: "BLOCK" })).toThrow(
      InvalidGbpAccessTransitionError
    )
  })

  describe("OVERRIDE", () => {
    it("sets any different state directly, including an out-of-band grant", () => {
      expect(
        transitionGbpAccess("not_requested", {
          type: "OVERRIDE",
          targetState: "granted",
        })
      ).toBe("granted")
      expect(
        transitionGbpAccess("revoked", {
          type: "OVERRIDE",
          targetState: "pending",
        })
      ).toBe("pending")
    })

    it("refuses a no-op override so an audit entry always marks a real change", () => {
      expect(() =>
        transitionGbpAccess("pending", {
          type: "OVERRIDE",
          targetState: "pending",
        })
      ).toThrow(InvalidGbpAccessTransitionError)
    })

    it("can reach every state from a working source", () => {
      for (const targetState of gbpAccessStates) {
        const source: GbpAccessState = "invited"
        if (targetState === source) {
          continue
        }
        expect(
          transitionGbpAccess(source, { type: "OVERRIDE", targetState })
        ).toBe(targetState)
      }
    })
  })
})

describe("gbpAccessOwnerPhase", () => {
  it("collapses the pre-grant states to in_progress", () => {
    expect(gbpAccessOwnerPhase("not_requested")).toBe("in_progress")
    expect(gbpAccessOwnerPhase("invited")).toBe("in_progress")
    expect(gbpAccessOwnerPhase("pending")).toBe("in_progress")
  })

  it("reports granted on its own", () => {
    expect(gbpAccessOwnerPhase("granted")).toBe("granted")
  })

  it("routes the stuck states to attention", () => {
    expect(gbpAccessOwnerPhase("revoked")).toBe("attention")
    expect(gbpAccessOwnerPhase("blocked")).toBe("attention")
  })

  it("maps every state (no unhandled member)", () => {
    for (const state of gbpAccessStates) {
      expect(["in_progress", "granted", "attention"]).toContain(
        gbpAccessOwnerPhase(state)
      )
    }
  })
})
