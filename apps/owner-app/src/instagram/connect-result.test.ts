import { describe, expect, it } from "vitest"

import { readInstagramConnectResult } from "./connect-result"

describe("readInstagramConnectResult", () => {
  it("accepts each flag the callback redirects with", () => {
    expect(readInstagramConnectResult("connected")).toBe("connected")
    expect(readInstagramConnectResult("connected_other_account")).toBe(
      "connected_other_account"
    )
    expect(readInstagramConnectResult("needs_professional_account")).toBe(
      "needs_professional_account"
    )
    expect(readInstagramConnectResult("error")).toBe("error")
  })

  it("rejects a value nobody on our side wrote", () => {
    // The query string is attacker-controllable, so anything unrecognized —
    // including a repeated param, which arrives as an array — means no connect
    // happened and the owner belongs back in the normal chat flow.
    expect(readInstagramConnectResult("CONNECTED")).toBeUndefined()
    expect(readInstagramConnectResult("connected; drop")).toBeUndefined()
    expect(readInstagramConnectResult(["connected"])).toBeUndefined()
    expect(readInstagramConnectResult(undefined)).toBeUndefined()
  })
})
