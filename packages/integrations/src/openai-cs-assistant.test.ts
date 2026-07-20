import { describe, expect, it, vi } from "vitest"

import { createIntegrationAdapters } from "./index"
import type { CsAssistantComposeInput } from "./cs-assistant-contracts"
import {
  buildCsAssistantPrompt,
  createProductionCsAssistant,
} from "./openai-cs-assistant"

const productionEnv = {
  APP_INTEGRATION_MODE: "production",
  OPENAI_API_KEY: "test-openai-key",
} as const

function input(
  overrides: Partial<CsAssistantComposeInput> = {}
): CsAssistantComposeInput {
  return {
    storeName: "브런치모먼트 홍대점",
    storeProfileSummary: "카페 · 서울 마포구",
    gbpConnectionState: "missing_google_connection",
    campaignStatuses: [],
    currentSection: "gbp_connect",
    currentStage: null,
    recentActions: ["gbp_connect:view", "gbp_connect:connect_click"],
    history: [{ role: "owner", body: "연결이 안 돼요" }],
    ownerMessage: "구글 연결 도와주세요",
    ...overrides,
  }
}

function responsesReply(reply: string): Response {
  return new Response(
    JSON.stringify({ output_text: JSON.stringify({ reply }) })
  )
}

type FetchCall = { readonly url: string; readonly init: RequestInit }

type ResponsesBody = {
  readonly model: string
  readonly text: { readonly format: Record<string, unknown> }
  readonly input: readonly {
    readonly content: readonly { readonly text: string }[]
  }[]
}

function firstCall(fetchImpl: ReturnType<typeof vi.fn>): FetchCall {
  const call = fetchImpl.mock.calls[0]
  if (call === undefined) {
    throw new Error("fetch was not called")
  }
  return { url: call[0] as string, init: call[1] as RequestInit }
}

function requestBody(fetchImpl: ReturnType<typeof vi.fn>): ResponsesBody {
  return JSON.parse(firstCall(fetchImpl).init.body as string) as ResponsesBody
}

function promptText(body: ResponsesBody): string {
  const text = body.input[0]?.content[0]?.text
  if (text === undefined) {
    throw new Error("prompt text missing from request body")
  }
  return text
}

describe("production CsAssistant", () => {
  it("posts the exact Responses request and returns the grounded reply", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(responsesReply("연결을 도와드릴게요."))
    const assistant = createProductionCsAssistant(productionEnv, fetchImpl)

    const result = await assistant.composeReply(input())

    expect(result).toEqual({
      kind: "ok",
      value: { reply: "연결을 도와드릴게요." },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const { url, init } = firstCall(fetchImpl)
    expect(url).toBe("https://api.openai.com/v1/responses")
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer test-openai-key",
        "Content-Type": "application/json",
      },
    })
    const body = requestBody(fetchImpl)
    expect(body.model).toBe("gpt-5.5")
    expect(body.text.format).toMatchObject({
      name: "cs_assistant_reply",
      strict: true,
      type: "json_schema",
    })
    // The grounding the caller assembled reaches the model.
    const prompt = promptText(body)
    expect(prompt).toContain("브런치모먼트 홍대점")
    expect(prompt).toContain("gbp_connect")
    expect(prompt).toContain("구글 연결 도와주세요")
  })

  it("prefers the configured CS model over the default", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(responsesReply("네"))
    const assistant = createProductionCsAssistant(
      { ...productionEnv, OPENAI_CS_ASSISTANT_MODEL: "gpt-5.4-mini" },
      fetchImpl
    )

    await assistant.composeReply(input())

    expect(requestBody(fetchImpl).model).toBe("gpt-5.4-mini")
  })

  it("returns blocked_by_credentials without calling OpenAI when the key is missing", async () => {
    const fetchImpl = vi.fn()
    const assistant = createProductionCsAssistant(
      { APP_INTEGRATION_MODE: "production" },
      fetchImpl
    )

    const result = await assistant.composeReply(input())

    expect(result).toEqual({
      kind: "blocked_by_credentials",
      code: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: ["OPENAI_API_KEY"],
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("surfaces a malformed OpenAI response as an error rather than a bad reply", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ output_text: "not json" }))
      )
    const assistant = createProductionCsAssistant(productionEnv, fetchImpl)

    await expect(assistant.composeReply(input())).rejects.toThrow(
      /Malformed LLM response/
    )
  })

  it("is selected in production mode through the adapter factory", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(responsesReply("도와드릴게요."))
    const adapters = createIntegrationAdapters({
      env: productionEnv,
      fetchImpl,
    })

    const result = await adapters.csAssistant.composeReply(input())

    expect(result).toEqual({ kind: "ok", value: { reply: "도와드릴게요." } })
  })
})

describe("buildCsAssistantPrompt", () => {
  it("treats owner text as data and omits empty grounding gracefully", () => {
    const prompt = buildCsAssistantPrompt(
      input({
        storeProfileSummary: "",
        campaignStatuses: [],
        recentActions: [],
        history: [],
      })
    )
    expect(prompt).toContain("데이터로만 취급")
    expect(prompt).toContain("(이전 대화 없음)")
    expect(prompt).toContain("(정보 없음)")
  })
})
