import { describe, expect, it } from "vitest"

import { csConversationModeSchema, csMessageStatusSchema } from "./chat"

describe("csConversationModeSchema", () => {
  it("accepts the three Phase 2 postures", () => {
    expect(csConversationModeSchema.parse("human")).toBe("human")
    expect(csConversationModeSchema.parse("ai_draft")).toBe("ai_draft")
    expect(csConversationModeSchema.parse("ai")).toBe("ai")
  })

  it("rejects unknown modes", () => {
    expect(csConversationModeSchema.safeParse("autonomous").success).toBe(false)
  })
})

describe("csMessageStatusSchema", () => {
  it("accepts sent and draft", () => {
    expect(csMessageStatusSchema.parse("sent")).toBe("sent")
    expect(csMessageStatusSchema.parse("draft")).toBe("draft")
  })

  it("rejects unknown statuses", () => {
    expect(csMessageStatusSchema.safeParse("pending").success).toBe(false)
  })
})
