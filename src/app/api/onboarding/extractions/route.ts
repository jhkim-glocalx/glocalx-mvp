import type { NextRequest } from "next/server"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  getStoredSessionFromCookieValues,
  onboardingCompleteCookieName,
} from "@/auth/session"
import {
  onboardingExtractionRequestSchema,
  parseRoutePayload,
} from "@/domain/schemas"
import type { BusinessProfileExtractionResult } from "@/onboarding/extraction"
import { extractBusinessProfile } from "@/onboarding/extraction"
import { createIntegrationAdapters } from "@/integrations"
import { openDatabase } from "@/server/db/sqlite"

type JsonPayloadResult =
  | {
      readonly kind: "ok"
      readonly payload: unknown
    }
  | {
      readonly kind: "invalid_json"
    }

type PublicExtractionResult =
  | Exclude<
      BusinessProfileExtractionResult,
      { readonly status: "NAVER_REQUEST_READY" }
    >
  | {
      readonly status: "NAVER_REQUEST_READY"
      readonly normalizedQuery: string
      readonly request: {
        readonly method: string
        readonly url: string
        readonly requiredHeaders: readonly string[]
      }
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

function toPublicResult(
  result: BusinessProfileExtractionResult
): PublicExtractionResult {
  if (result.status !== "NAVER_REQUEST_READY") {
    return result
  }

  return {
    status: "NAVER_REQUEST_READY",
    normalizedQuery: result.normalizedQuery,
    request: {
      method: result.request.method,
      url: result.request.url,
      requiredHeaders: Object.keys(result.request.headers),
    },
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

  const parsed = parseRoutePayload(
    onboardingExtractionRequestSchema,
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
    const result = extractBusinessProfile({
      adapters,
      database,
      input: parsed.value.input,
      storeId: session.storeId,
    })

    return Response.json(toPublicResult(result))
  } finally {
    database.close()
  }
}
