import { describe, expect, it } from "vitest"

import type { CsAssistantComposeInput } from "./cs-assistant-contracts"
import { createStubCsAssistant } from "./stub-cs-assistant"

function input(
  overrides: Partial<CsAssistantComposeInput> = {}
): CsAssistantComposeInput {
  return {
    storeName: "테스트 매장",
    storeProfileSummary: "카페",
    gbpConnectionState: "not_connected",
    campaignStatuses: [],
    currentSection: "home",
    currentStage: null,
    recentActions: [],
    history: [],
    ownerMessage: "안녕하세요",
    ...overrides,
  }
}

describe("stub CsAssistant", () => {
  it("returns a deterministic reply for the same input", async () => {
    const assistant = createStubCsAssistant()
    const first = await assistant.composeReply(input())
    const second = await assistant.composeReply(input())
    expect(first).toEqual(second)
    expect(first.kind).toBe("ok")
  })

  it("keys the reply off the owner's current section", async () => {
    const assistant = createStubCsAssistant()
    const home = await assistant.composeReply(input({ currentSection: "home" }))
    const gbp = await assistant.composeReply(
      input({ currentSection: "gbp_connect" })
    )
    expect(home).not.toEqual(gbp)
    if (gbp.kind === "ok") {
      expect(gbp.value.reply).toContain("구글 비즈니스 프로필")
    }
  })

  it("falls back to a courteous reply for an unknown section", async () => {
    const assistant = createStubCsAssistant()
    const result = await assistant.composeReply(
      input({ currentSection: "some_new_screen" })
    )
    expect(result.kind).toBe("ok")
    if (result.kind === "ok") {
      expect(result.value.reply.length).toBeGreaterThan(0)
    }
  })
})
