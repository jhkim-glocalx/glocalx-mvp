import type { NextRequest } from "next/server"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  getStoredSessionFromCookieValues,
  onboardingCompleteCookieName,
} from "@/auth/session"
import {
  confirmedStoreProfileSchema,
  parseRoutePayload,
} from "@/domain/schemas"
import { createIntegrationAdapters } from "@/integrations"
import { confirmStoreProfile } from "@/onboarding/store-profile"
import { openDatabase } from "@/server/db/sqlite"

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

  const parsed = parseRoutePayload(confirmedStoreProfileSchema, payload.payload)
  if (parsed.kind === "validation_error") {
    return Response.json(
      {
        status: "VALIDATION_ERROR",
        issues: parsed.issues,
      },
      { status: 400 }
    )
  }

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

  const database = openDatabase()
  try {
    const adapters = createIntegrationAdapters({ database })
    return Response.json(
      confirmStoreProfile({
        adapters,
        database,
        profile: parsed.value,
        storeId: session.storeId,
      })
    )
  } finally {
    database.close()
  }
}
