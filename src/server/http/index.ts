import type { NextRequest } from "next/server"
import type { z } from "zod"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  getStoredSessionFromCookieValues,
  onboardingCompleteCookieName,
} from "@/auth/session"
import type { DemoSession } from "@/auth/session"
import { parseRoutePayload } from "@/domain/schemas"
import type { ParsedValidationIssue } from "@/domain/schemas"
import { createIntegrationAdapters } from "@/integrations"
import type { DatabaseContext } from "@/server/db"
import { openDatabaseContext } from "@/server/db"
import { createDatabaseOnboardingExtractionRepository } from "@/server/repositories/onboarding-extraction"
import { createDatabaseSessionStore } from "@/server/repositories/session-store"
import type { SessionStore } from "@/server/repositories/session-store"
import { createDatabaseStoreProfileRepository } from "@/server/repositories/store-profile"

type JsonPayloadResult =
  | {
      readonly kind: "ok"
      readonly payload: unknown
    }
  | {
      readonly kind: "invalid_json"
    }

export type ParsedJsonRoutePayload<TValue> =
  | {
      readonly kind: "ok"
      readonly value: TValue
    }
  | {
      readonly kind: "response"
      readonly response: Response
    }

export type RouteDatabaseContext = {
  readonly adapters: ReturnType<typeof createIntegrationAdapters>
  readonly database: DatabaseContext["legacySqliteDatabase"]
}

export type QueryableRouteDatabaseContext = {
  readonly adapters: ReturnType<typeof createIntegrationAdapters>
  readonly onboardingExtractionRepository: ReturnType<
    typeof createDatabaseOnboardingExtractionRepository
  >
  readonly sessionStore: SessionStore
  readonly storeProfileRepository: ReturnType<
    typeof createDatabaseStoreProfileRepository
  >
}

async function readJsonBody(request: NextRequest): Promise<JsonPayloadResult> {
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

export async function parseJsonRoutePayload<TValue>(
  request: NextRequest,
  schema: z.ZodType<TValue>
): Promise<ParsedJsonRoutePayload<TValue>> {
  const payload = await readJsonBody(request)
  if (payload.kind === "invalid_json") {
    return {
      kind: "response",
      response: malformedJsonResponse(),
    }
  }

  const parsed = parseRoutePayload(schema, payload.payload)
  if (parsed.kind === "validation_error") {
    return {
      kind: "response",
      response: validationErrorResponse(parsed.issues),
    }
  }

  return {
    kind: "ok",
    value: parsed.value,
  }
}

export function malformedJsonResponse(): Response {
  return Response.json(
    {
      status: "VALIDATION_ERROR",
      message: "요청 JSON을 읽을 수 없습니다.",
    },
    { status: 400 }
  )
}

export function validationErrorResponse(
  issues: readonly ParsedValidationIssue[]
): Response {
  return Response.json(
    {
      status: "VALIDATION_ERROR",
      issues,
    },
    { status: 400 }
  )
}

export function requiredSessionResponse(): Response {
  return Response.json(
    {
      status: "AUTH_REQUIRED",
      message: "로그인이 필요합니다.",
    },
    { status: 401 }
  )
}

export function forbiddenStoreResponse(): Response {
  return Response.json(
    {
      status: "FORBIDDEN",
      message: "요청한 매장에 접근할 수 없습니다.",
    },
    { status: 403 }
  )
}

export function readDemoSession(request: NextRequest): DemoSession | undefined {
  return getStoredSessionFromCookieValues({
    onboardingComplete: request.cookies.get(onboardingCompleteCookieName)
      ?.value,
    storeId: request.cookies.get(demoStoreCookieName)?.value,
    userId: request.cookies.get(demoSessionCookieName)?.value,
  })
}

export async function readDatabaseSession(
  request: NextRequest,
  sessionStore: SessionStore
): Promise<DemoSession | undefined> {
  return sessionStore.readSessionFromCookieValues({
    onboardingComplete: request.cookies.get(onboardingCompleteCookieName)
      ?.value,
    storeId: request.cookies.get(demoStoreCookieName)?.value,
    userId: request.cookies.get(demoSessionCookieName)?.value,
  })
}

export function requireSessionStoreAccess(
  session: DemoSession,
  storeId: string
): Response | undefined {
  return storeId === session.storeId ? undefined : forbiddenStoreResponse()
}

export async function withRouteDatabase<TResponse extends Response>(
  handler: (context: RouteDatabaseContext) => Promise<TResponse> | TResponse
): Promise<TResponse> {
  const databaseContext = await openDatabaseContext()
  const database = databaseContext.legacySqliteDatabase

  try {
    return await handler({
      adapters: createIntegrationAdapters({ database }),
      database,
    })
  } finally {
    await databaseContext.close()
  }
}

export async function withQueryableRouteDatabase<TResponse extends Response>(
  handler: (
    context: QueryableRouteDatabaseContext
  ) => Promise<TResponse> | TResponse
): Promise<TResponse> {
  const databaseContext = await openDatabaseContext()
  const queryable = databaseContext.queryable

  try {
    return await handler({
      adapters: createIntegrationAdapters(),
      onboardingExtractionRepository:
        createDatabaseOnboardingExtractionRepository(queryable),
      sessionStore: createDatabaseSessionStore(queryable),
      storeProfileRepository: createDatabaseStoreProfileRepository(queryable),
    })
  } finally {
    await databaseContext.close()
  }
}
