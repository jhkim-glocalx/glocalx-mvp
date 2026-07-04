import type { NextRequest } from "next/server"

import { postingDecisionRequestSchema } from "@/domain/schemas"
import { processPostingDecision } from "@/posts/posting-conversation"
import {
  parseJsonRoutePayload,
  readDemoSession,
  requireSessionStoreAccess,
  requiredSessionResponse,
  withRouteDatabase,
} from "@/server/http"

function conversationFailureResponse(error: unknown): Response {
  console.error("Posting conversation failed", error)
  return Response.json(
    {
      status: "POSTING_CONVERSATION_FAILED",
      message: "AI 제안 응답을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.",
    },
    { status: 502 }
  )
}

export async function POST(request: NextRequest) {
  // Posting decisions are session-scoped before accepting any conversation payload.
  const session = readDemoSession(request)
  if (session === undefined) {
    return requiredSessionResponse()
  }

  const parsed = await parseJsonRoutePayload(
    request,
    postingDecisionRequestSchema
  )
  if (parsed.kind === "response") {
    return parsed.response
  }

  // Conversation updates are rejected if the requested store is not session-owned.
  const forbiddenResponse = requireSessionStoreAccess(
    session,
    parsed.value.storeId
  )
  if (forbiddenResponse !== undefined) {
    return forbiddenResponse
  }

  return withRouteDatabase(async ({ adapters, database }) => {
    try {
      const result = await processPostingDecision({
        adapters,
        database,
        request: parsed.value,
        storeId: session.storeId,
      })
      const status = result["status"] === "CONVERSATION_NOT_FOUND" ? 404 : 200
      return Response.json(result, { status })
    } catch (error) {
      if (error instanceof Error) {
        return conversationFailureResponse(error)
      }
      throw error
    }
  })
}
