import type { NextRequest } from "next/server"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  getStoredSessionFromCookieValues,
  onboardingCompleteCookieName,
} from "@/auth/session"
import {
  parseRoutePayload,
  postingDecisionRequestSchema,
} from "@/domain/schemas"
import { createIntegrationAdapters } from "@/integrations"
import { processPostingDecision } from "@/posts/posting-conversation"
import { openDatabaseContext } from "@/server/db"

type JsonPayloadResult =
  | {
      readonly kind: "ok"
      readonly payload: unknown
    }
  | {
      readonly kind: "invalid_json"
    }

async function readJsonPayload(
  request: NextRequest
): Promise<JsonPayloadResult> {
  try {
    return {
      kind: "ok",
      payload: await request.json(),
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { kind: "invalid_json" }
    }
    throw error
  }
}

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
  const session = getStoredSessionFromCookieValues({
    onboardingComplete: request.cookies.get(onboardingCompleteCookieName)
      ?.value,
    storeId: request.cookies.get(demoStoreCookieName)?.value,
    userId: request.cookies.get(demoSessionCookieName)?.value,
  })
  if (session === undefined) {
    return Response.json(
      {
        status: "AUTH_REQUIRED",
        message: "로그인이 필요합니다.",
      },
      { status: 401 }
    )
  }

  // Decode malformed JSON separately so Zod only handles well-formed payloads.
  const payload = await readJsonPayload(request)
  if (payload.kind === "invalid_json") {
    return Response.json(
      {
        status: "VALIDATION_ERROR",
        message: "요청 JSON을 읽을 수 없습니다.",
      },
      { status: 400 }
    )
  }

  const parsed = parseRoutePayload(
    postingDecisionRequestSchema,
    payload.payload
  )
  if (parsed.kind === "validation_error") {
    return Response.json(
      {
        status: "VALIDATION_ERROR",
        issues: parsed.issues,
      },
      { status: 400 }
    )
  }

  // Conversation updates are rejected if the requested store is not session-owned.
  if (parsed.value.storeId !== session.storeId) {
    return Response.json(
      {
        status: "FORBIDDEN",
        message: "요청한 매장에 접근할 수 없습니다.",
      },
      { status: 403 }
    )
  }

  const databaseContext = await openDatabaseContext()
  const database = databaseContext.legacySqliteDatabase

  try {
    const adapters = createIntegrationAdapters({ database })
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
  } finally {
    await databaseContext.close()
  }
}
