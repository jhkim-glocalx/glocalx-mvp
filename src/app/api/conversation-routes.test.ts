import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { openDatabase, resetDatabaseFile } from "@/server/db/sqlite"

import { POST as onboardingSlotTurn } from "./onboarding/conversation/slots/route"
import { POST as postingDecision } from "./posts/conversation/decision/route"

const tempPaths: string[] = []
const missingPostgresEnvNames = ["DATABASE_URL", "DATABASE_URL_DIRECT"].filter(
  (name) => !process.env[name]
)
const skipLivePostgresRoutes =
  process.env["DATABASE_PROVIDER"] === "postgres" &&
  missingPostgresEnvNames.length > 0
type ConversationRows = Readonly<Record<"assistantMessages" | "events", number>>

if (skipLivePostgresRoutes) {
  console.info(`BLOCKED_BY_ENV missing ${missingPostgresEnvNames.join(",")}`)
}

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
  cookieHeader = "glocalx_demo_session=demo-owner; glocalx_demo_store=demo-store"
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

function createOnboardingSlotRequest(
  body: Record<string, unknown>
): NextRequest {
  return createJsonRequest(
    "http://localhost:3000/api/onboarding/conversation/slots",
    body
  )
}

function readConversationRows(sessionId: string): ConversationRows {
  const database = openDatabase()
  try {
    const rows = database
      .prepare<
        unknown[],
        ConversationRows
      >("SELECT (SELECT COUNT(*) FROM conversation_messages WHERE session_id = ? AND role = 'assistant') AS assistantMessages, (SELECT COUNT(*) FROM conversation_events WHERE session_id = ?) AS events")
      .get(sessionId, sessionId)
    if (rows === undefined) {
      throw new Error("Expected conversation route rows")
    }
    return rows
  } finally {
    database.close()
  }
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

describe.skipIf(skipLivePostgresRoutes)("conversation API routes", () => {
  beforeEach(useTempDatabase)

  afterEach(async () => {
    resetDatabaseFile()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    for (const tempPath of tempPaths.splice(0)) {
      await rm(tempPath, { force: true, recursive: true })
    }
  })

  it("asks for one onboarding field at a time and replays duplicates", async () => {
    // Given
    const firstRequest = createOnboardingSlotRequest({
      candidate: naverCandidate,
      clientEventId: "slot-turn-1",
      currentState: "slot_elicitation",
      ownerMessage: "전화번호는 1-2342-232예요",
      requestedField: "phone",
    })

    // When
    const firstResponse = await onboardingSlotTurn(firstRequest)
    const firstPayload = await firstResponse.json()
    const secondResponse = await onboardingSlotTurn(
      createOnboardingSlotRequest({
        candidate: firstPayload.draft,
        clientEventId: "slot-turn-2",
        currentState: "slot_clarification",
        ownerMessage: "평일 9-6이에요",
        requestedField: "hours",
        sessionId: firstPayload.sessionId,
      })
    )
    const secondPayload = await secondResponse.json()
    const replayResponse = await onboardingSlotTurn(
      createOnboardingSlotRequest({
        candidate: firstPayload.draft,
        clientEventId: "slot-turn-2",
        currentState: "slot_clarification",
        ownerMessage: "다른 시간으로 바꾸려는 재전송입니다.",
        requestedField: "hours",
        sessionId: firstPayload.sessionId,
      })
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

  it("replays concurrent duplicate onboarding events without duplicate rows", async () => {
    // Given
    const firstResponse = await onboardingSlotTurn(
      createOnboardingSlotRequest({
        candidate: naverCandidate,
        clientEventId: "slot-turn-concurrent-1",
        currentState: "slot_elicitation",
        ownerMessage: "전화번호는 1-2342-232예요",
        requestedField: "phone",
      })
    )
    const firstPayload = await firstResponse.json()
    const rowsBeforeDuplicate = readConversationRows(firstPayload.sessionId)

    // When
    const duplicateResponses = await Promise.all(
      ["평일 9-6이에요", "중복 제출입니다."].map((ownerMessage) =>
        onboardingSlotTurn(
          createOnboardingSlotRequest({
            candidate: firstPayload.draft,
            clientEventId: "slot-turn-concurrent-2",
            currentState: "slot_clarification",
            ownerMessage,
            requestedField: "hours",
            sessionId: firstPayload.sessionId,
          })
        )
      )
    )
    const firstDuplicate = duplicateResponses[0]
    const secondDuplicate = duplicateResponses[1]
    if (firstDuplicate === undefined || secondDuplicate === undefined) {
      throw new Error("Expected two duplicate route responses")
    }
    const firstDuplicatePayload = await firstDuplicate.json()
    const secondDuplicatePayload = await secondDuplicate.json()

    // Then
    expect(firstDuplicate.status).toBe(200)
    expect(secondDuplicate.status).toBe(200)
    expect(secondDuplicatePayload).toEqual(firstDuplicatePayload)
    expect(readConversationRows(firstPayload.sessionId)).toEqual({
      assistantMessages: rowsBeforeDuplicate.assistantMessages + 1,
      events: rowsBeforeDuplicate.events + 1,
    })
  })

  it("fills onboarding fields from explicit owner text when production LLM credentials are absent", async () => {
    // Given
    vi.stubEnv("APP_INTEGRATION_MODE", "production")
    vi.stubEnv("OPENAI_API_KEY", "")
    const request = createOnboardingSlotRequest({
      candidate: naverCandidate,
      clientEventId: "slot-turn-production-local-fill",
      currentState: "slot_elicitation",
      ownerMessage: "전화번호 01082432196",
      requestedField: "phone",
    })

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
    const request = createOnboardingSlotRequest({
      candidate: naverCandidate,
      clientEventId: "slot-turn-production-llm-fallback",
      currentState: "slot_elicitation",
      ownerMessage: "영업시간은 weekdays 6 to 10pm 이에요",
      requestedField: "hours",
    })

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
