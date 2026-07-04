import type { NextRequest } from "next/server"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  getStoredSessionFromCookieValues,
  onboardingCompleteCookieName,
} from "@/auth/session"
import {
  onboardingSlotTurnRequestSchema,
  parseRoutePayload,
} from "@/domain/schemas"
import { createIntegrationAdapters } from "@/integrations"
import { processOnboardingSlotTurn } from "@/onboarding/conversation"
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

export async function POST(request: NextRequest) {
  // Slot turns are scoped to the session store before any client payload is used.
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
    onboardingSlotTurnRequestSchema,
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

  const databaseContext = await openDatabaseContext()
  const database = databaseContext.legacySqliteDatabase

  try {
    const adapters = createIntegrationAdapters({ database })
    const result = await processOnboardingSlotTurn({
      adapters,
      database,
      request: parsed.value,
      storeId: session.storeId,
    })
    const status = result["status"] === "CONVERSATION_NOT_FOUND" ? 404 : 200
    return Response.json(result, { status })
  } finally {
    await databaseContext.close()
  }
}
