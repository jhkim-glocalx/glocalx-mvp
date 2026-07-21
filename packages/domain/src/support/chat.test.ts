import { describe, expect, it } from "vitest"

import {
  csAdminDiscardDraftRequestSchema,
  csAdminSendDraftRequestSchema,
  csAdminSetModeRequestSchema,
  csConversationModeSchema,
  csMessageStatusSchema,
} from "./chat"

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

describe("csAdminSetModeRequestSchema", () => {
  it("accepts a known mode", () => {
    expect(csAdminSetModeRequestSchema.parse({ mode: "ai_draft" })).toEqual({
      mode: "ai_draft",
    })
  })

  it("rejects an unknown mode and unexpected keys", () => {
    expect(csAdminSetModeRequestSchema.safeParse({ mode: "bot" }).success).toBe(
      false
    )
    expect(
      csAdminSetModeRequestSchema.safeParse({ mode: "human", extra: 1 }).success
    ).toBe(false)
  })
})

describe("csAdminSendDraftRequestSchema", () => {
  it("accepts a message id and body", () => {
    expect(
      csAdminSendDraftRequestSchema.parse({ messageId: "m-1", body: "  hi  " })
    ).toEqual({ messageId: "m-1", body: "hi" })
  })

  it("rejects an empty id or empty body", () => {
    expect(
      csAdminSendDraftRequestSchema.safeParse({ messageId: "", body: "hi" })
        .success
    ).toBe(false)
    expect(
      csAdminSendDraftRequestSchema.safeParse({ messageId: "m-1", body: "   " })
        .success
    ).toBe(false)
  })
})

describe("csAdminDiscardDraftRequestSchema", () => {
  it("accepts a message id", () => {
    expect(
      csAdminDiscardDraftRequestSchema.parse({ messageId: "m-1" })
    ).toEqual({ messageId: "m-1" })
  })

  it("rejects an empty id", () => {
    expect(
      csAdminDiscardDraftRequestSchema.safeParse({ messageId: "" }).success
    ).toBe(false)
  })
})
