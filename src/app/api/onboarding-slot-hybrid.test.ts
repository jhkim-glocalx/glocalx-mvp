import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  applyMigrations,
  openDatabase,
  resetDatabaseFile,
  seedDemoData,
} from "@/server/db/sqlite"

import { POST as onboardingSlotTurn } from "./onboarding/conversation/slots/route"

const demoCookieHeader =
  "glocalx_demo_session=demo-owner; glocalx_demo_store=demo-store"
const tempPaths: string[] = []

const naverCandidate = {
  address: "서울 마포구 와우산로 123",
  candidateId: "naver-chat-candidate",
  category: "브런치 카페",
  missingFields: ["phone", "hours"],
  name: "브런치모먼트 홍대점",
  source: "NAVER_LOCAL",
  sourceInput: "https://naver.me/mybrunchcafe",
}

async function useProductionTempDatabase(): Promise<void> {
  const tempPath = await mkdtemp(join(tmpdir(), "glocalx-slot-hybrid-"))
  tempPaths.push(tempPath)
  vi.stubEnv("APP_INTEGRATION_MODE", "production")
  vi.stubEnv("PLAYWRIGHT_TEST", "true")
  vi.stubEnv("GLOCALX_DB_PATH", join(tempPath, "routes.db"))
  vi.stubEnv("OPENAI_API_KEY", "openai-key")
  resetDatabaseFile()
  const database = openDatabase()
  try {
    applyMigrations(database)
    seedDemoData(database)
  } finally {
    database.close()
  }
}

function createSlotRequest(
  ownerMessage: string,
  requestedField: "hours" | "phone"
) {
  return new NextRequest(
    "http://localhost:3000/api/onboarding/conversation/slots",
    {
      body: JSON.stringify({
        candidate: naverCandidate,
        clientEventId: `slot-turn-${requestedField}-${ownerMessage.length}`,
        currentState: "slot_elicitation",
        ownerMessage,
        requestedField,
      }),
      headers: {
        Cookie: demoCookieHeader,
        "Content-Type": "application/json",
      },
      method: "POST",
    }
  )
}

describe("onboarding slot hybrid extraction", () => {
  beforeEach(async () => {
    await useProductionTempDatabase()
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

  it("does not call OpenAI when rule-based slot extraction succeeds", async () => {
    // Given
    const fetchMock = vi.fn(async () => new Response("{}"))
    vi.stubGlobal("fetch", fetchMock)

    // When
    const response = await onboardingSlotTurn(
      createSlotRequest("전화번호 01082432196", "phone")
    )
    const payload = await response.json()

    // Then
    expect(response.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(payload).toMatchObject({
      draft: { phone: "01082432196" },
      missingFields: ["hours"],
      status: "ONBOARDING_CONVERSATION_TURN",
    })
  })

  it("uses a lightweight OpenAI model when rules cannot parse the slot", async () => {
    // Given
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
      expect(String(init?.body)).toContain('"model":"gpt-5.4-mini"')
      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            assistantMessage: "영업시간을 양식에 채웠어요.",
            confidence: "medium",
            extractedFields: {
              hours: "월-화 17:00-22:00, 수-금 17:00-20:00",
            },
            fieldConfidence: { hours: "medium" },
            missingFields: ["phone"],
            needsOwnerConfirmation: false,
            nextState: "slot_clarification",
          }),
        })
      )
    })
    vi.stubGlobal("fetch", fetchMock)

    // When
    const response = await onboardingSlotTurn(
      createSlotRequest("월-화 5시-10시, 수-금 5시-8시", "hours")
    )
    const payload = await response.json()

    // Then
    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(payload).toMatchObject({
      draft: { hours: "월-화 17:00-22:00, 수-금 17:00-20:00" },
      missingFields: ["phone"],
      status: "ONBOARDING_CONVERSATION_TURN",
    })
  })

  it("asks the owner to input again when rules and OpenAI both fail", async () => {
    // Given
    const fetchMock = vi.fn(async () => {
      throw new TypeError("OpenAI unavailable")
    })
    vi.stubGlobal("fetch", fetchMock)

    // When
    const response = await onboardingSlotTurn(
      createSlotRequest("대충 저녁쯤 해요", "hours")
    )
    const payload = await response.json()

    // Then
    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(payload).toMatchObject({
      draft: { missingFields: ["phone", "hours"] },
      missingFields: ["phone", "hours"],
      status: "ONBOARDING_CONVERSATION_TURN",
    })
    expect(payload.assistantMessage).toContain("영업시간을 확인하지 못했어요")
  })
})
