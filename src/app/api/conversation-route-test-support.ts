import { NextRequest } from "next/server"

import { openDatabase } from "@/server/db/sqlite"

export type ConversationRows = Readonly<
  Record<"assistantMessages" | "events" | "messages" | "slots", number>
> &
  Readonly<{
    hours: string | null
    state: string
  }>

export const naverCandidate = {
  address: "서울 마포구 와우산로 123",
  candidateId: "naver-chat-candidate",
  category: "브런치 카페",
  missingFields: ["phone", "hours"],
  name: "브런치모먼트 홍대점",
  source: "NAVER_LOCAL",
  sourceInput: "https://naver.me/mybrunchcafe",
}

export function createJsonRequest(
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

export function createOnboardingSlotRequest(
  body: Record<string, unknown>
): NextRequest {
  return createJsonRequest(
    "http://localhost:3000/api/onboarding/conversation/slots",
    body
  )
}

export function readConversationRows(sessionId: string): ConversationRows {
  const database = openDatabase()
  try {
    const rows = database
      .prepare<
        unknown[],
        ConversationRows
      >("SELECT (SELECT COUNT(*) FROM conversation_messages WHERE session_id = ? AND role = 'assistant') AS assistantMessages, (SELECT COUNT(*) FROM conversation_messages WHERE session_id = ?) AS messages, (SELECT COUNT(*) FROM conversation_events WHERE session_id = ?) AS events, (SELECT COUNT(*) FROM conversation_slot_values WHERE session_id = ?) AS slots, (SELECT value FROM conversation_slot_values WHERE session_id = ? AND slot_key = 'hours') AS hours, (SELECT state FROM conversation_sessions WHERE id = ?) AS state")
      .get(sessionId, sessionId, sessionId, sessionId, sessionId, sessionId)
    if (rows === undefined) {
      throw new Error("Expected conversation route rows")
    }
    return rows
  } finally {
    database.close()
  }
}
