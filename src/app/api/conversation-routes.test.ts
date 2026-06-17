import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetDatabaseFile } from "@/server/db/sqlite"

import { POST as onboardingSlotTurn } from "./onboarding/conversation/slots/route"
import { POST as postingDecision } from "./posts/conversation/decision/route"

const demoCookieHeader =
  "glocalx_demo_session=demo-owner; glocalx_demo_store=demo-store"
const tempPaths: string[] = []

async function useTempDatabase(): Promise<void> {
  const tempPath = await mkdtemp(join(tmpdir(), "glocalx-conversation-routes-"))
  tempPaths.push(tempPath)
  vi.stubEnv("APP_INTEGRATION_MODE", "stub")
  vi.stubEnv("GLOCALX_DB_PATH", join(tempPath, "routes.db"))
  resetDatabaseFile()
}

function createJsonRequest(
  url: string,
  body: Record<string, unknown>,
  cookieHeader: string = demoCookieHeader
): NextRequest {
  return new NextRequest(url, {
    body: JSON.stringify(body),
    headers: {
      Cookie: cookieHeader,
      "Content-Type": "application/json",
    },
    method: "POST",
  })
}

const naverCandidate = {
  address: "서울 마포구 와우산로 123",
  candidateId: "naver-chat-candidate",
  category: "브런치 카페",
  missingFields: ["phone", "hours"],
  name: "브런치모먼트 홍대점",
  source: "NAVER_LOCAL",
  sourceInput: "https://naver.me/mybrunchcafe",
}

describe("conversation API routes", () => {
  beforeEach(async () => {
    await useTempDatabase()
  })

  afterEach(async () => {
    resetDatabaseFile()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    for (const tempPath of tempPaths) {
      await rm(tempPath, { force: true, recursive: true })
    }
    tempPaths.length = 0
  })

  it("asks for one onboarding field at a time and replays duplicates", async () => {
    // Given
    const firstRequest = createJsonRequest(
      "http://localhost:3000/api/onboarding/conversation/slots",
      {
        candidate: naverCandidate,
        clientEventId: "slot-turn-1",
        currentState: "slot_elicitation",
        ownerMessage: "전화번호는 1-2342-232예요",
        requestedField: "phone",
      }
    )

    // When
    const firstResponse = await onboardingSlotTurn(firstRequest)
    const firstPayload = await firstResponse.json()
    const secondResponse = await onboardingSlotTurn(
      createJsonRequest(
        "http://localhost:3000/api/onboarding/conversation/slots",
        {
          candidate: firstPayload.draft,
          clientEventId: "slot-turn-2",
          currentState: "slot_clarification",
          ownerMessage: "평일 9-6이에요",
          requestedField: "hours",
          sessionId: firstPayload.sessionId,
        }
      )
    )
    const secondPayload = await secondResponse.json()
    const replayResponse = await onboardingSlotTurn(
      createJsonRequest(
        "http://localhost:3000/api/onboarding/conversation/slots",
        {
          candidate: firstPayload.draft,
          clientEventId: "slot-turn-2",
          currentState: "slot_clarification",
          ownerMessage: "다른 시간으로 바꾸려는 재전송입니다.",
          requestedField: "hours",
          sessionId: firstPayload.sessionId,
        }
      )
    )

    // Then
    expect(firstResponse.status).toBe(200)
    expect(firstPayload).toMatchObject({
      draft: {
        phone: "1-2342-232",
      },
      missingFields: ["hours"],
      needsOwnerConfirmation: false,
      status: "ONBOARDING_CONVERSATION_TURN",
    })
    expect(firstPayload.assistantMessage).toContain("영업시간")
    expect(secondResponse.status).toBe(200)
    expect(secondPayload).toMatchObject({
      draft: {
        hours: "평일 09:00-18:00",
        phone: "1-2342-232",
      },
      missingFields: [],
      needsOwnerConfirmation: true,
      status: "ONBOARDING_CONVERSATION_TURN",
    })
    expect(secondPayload.assistantMessage).toContain("정보가 맞으면")
    expect(await replayResponse.json()).toEqual(secondPayload)
  })

  it("fills onboarding fields from explicit owner text when production LLM credentials are absent", async () => {
    // Given
    vi.stubEnv("APP_INTEGRATION_MODE", "production")
    vi.stubEnv("OPENAI_API_KEY", "")
    const request = createJsonRequest(
      "http://localhost:3000/api/onboarding/conversation/slots",
      {
        candidate: naverCandidate,
        clientEventId: "slot-turn-production-local-fill",
        currentState: "slot_elicitation",
        ownerMessage: "전화번호 01082432196",
        requestedField: "phone",
      }
    )

    // When
    const response = await onboardingSlotTurn(request)
    const payload = await response.json()

    // Then
    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      draft: {
        phone: "01082432196",
      },
      missingFields: ["hours"],
      status: "ONBOARDING_CONVERSATION_TURN",
    })
  })

  it("falls back to local onboarding field extraction when production LLM slot extraction fails", async () => {
    // Given
    vi.stubEnv("APP_INTEGRATION_MODE", "production")
    vi.stubEnv("OPENAI_API_KEY", "openai-key")
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 }))
    const request = createJsonRequest(
      "http://localhost:3000/api/onboarding/conversation/slots",
      {
        candidate: naverCandidate,
        clientEventId: "slot-turn-production-llm-fallback",
        currentState: "slot_elicitation",
        ownerMessage: "영업시간은 weekdays 6 to 10pm 이에요",
        requestedField: "hours",
      }
    )

    // When
    const response = await onboardingSlotTurn(request)
    const payload = await response.json()

    // Then
    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      draft: {
        hours: "평일 18:00-22:00",
      },
      missingFields: ["phone"],
      status: "ONBOARDING_CONVERSATION_TURN",
    })
  })

  it("routes posting revision text through the conversation decision endpoint", async () => {
    // Given
    const request = createJsonRequest(
      "http://localhost:3000/api/posts/conversation/decision",
      {
        activeSuggestionId: "suggest-closeup-weekend-menu",
        clientEventId: "posting-decision-1",
        draftId: "demo-post-draft",
        draftSummary:
          "브런치모먼트 홍대점에서 주말 브런치 신메뉴를 소개합니다.",
        ownerIntent: "이번 주말 브런치 신메뉴 홍보",
        ownerMessage: "더 젊은 톤으로 바꿔줘",
        storeId: "demo-store",
        suggestionMessage:
          "대표 메뉴가 잘 보이는 이미지를 첫 장으로 쓰면 전환이 좋아집니다.",
      }
    )

    // When
    const response = await postingDecision(request)
    const payload = await response.json()

    // Then
    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      decision: "revision_requested",
      draft: {
        status: "DRAFT_READY",
      },
      status: "POSTING_CONVERSATION_TURN",
    })
  })
})
