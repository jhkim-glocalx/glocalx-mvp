import type { NextRequest } from "next/server"
import type { z } from "zod"

import {
  allowsLegacyTestSessions,
  authSessionCookieName,
  demoSessionCookieName,
  demoStoreCookieName,
  onboardingCompleteCookieName,
} from "@/auth/session"
import type { DemoSession } from "@/auth/session"
import { parseRoutePayload } from "@/domain/schemas"
import type { ParsedValidationIssue } from "@/domain/schemas"
import { createIntegrationAdapters } from "@/integrations"
import { openDatabaseContext, resolveDatabaseConfig } from "@/server/db"
import type { SqliteDatabase } from "@/server/db/sqlite"
import { createDatabaseConversationStore } from "@/server/repositories/conversation-store"
import type { ConversationStore } from "@/server/repositories/conversation-store"
import { createDatabaseEmailCredentialsRepository } from "@/server/repositories/email-credentials"
import { createDatabaseGbpStore } from "@/server/repositories/gbp-store"
import { createDatabaseOAuthIdentityRepository } from "@/server/repositories/oauth-identity"
import { createDatabaseOnboardingExtractionRepository } from "@/server/repositories/onboarding-extraction"
import { createDatabasePostStore } from "@/server/repositories/post-store"
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

export type QueryableRouteDatabaseContext = {
  readonly adapters: ReturnType<typeof createIntegrationAdapters>
  readonly conversationStore: ConversationStore
  readonly emailCredentialsRepository: ReturnType<
    typeof createDatabaseEmailCredentialsRepository
  >
  readonly gbpStore: ReturnType<typeof createDatabaseGbpStore>
  readonly legacySqliteDatabase?: SqliteDatabase
  readonly oauthIdentityRepository: ReturnType<
    typeof createDatabaseOAuthIdentityRepository
  >
  readonly onboardingExtractionRepository: ReturnType<
    typeof createDatabaseOnboardingExtractionRepository
  >
  readonly postStore: ReturnType<typeof createDatabasePostStore>
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

export async function readDatabaseSession(
  request: NextRequest,
  sessionStore: SessionStore
): Promise<DemoSession | undefined> {
  const readLegacyCookies = allowsLegacyTestSessions()
  return sessionStore.readSessionFromCookieValues({
    authSessionId: request.cookies.get(authSessionCookieName)?.value,
    onboardingComplete: request.cookies.get(onboardingCompleteCookieName)
      ?.value,
    storeId: readLegacyCookies
      ? request.cookies.get(demoStoreCookieName)?.value
      : undefined,
    userId: readLegacyCookies
      ? request.cookies.get(demoSessionCookieName)?.value
      : undefined,
  })
}

export function requireSessionStoreAccess(
  session: DemoSession,
  storeId: string
): Response | undefined {
  return storeId === session.storeId ? undefined : forbiddenStoreResponse()
}

export async function withQueryableRouteDatabase<TResponse extends Response>(
  handler: (
    context: QueryableRouteDatabaseContext
  ) => Promise<TResponse> | TResponse
): Promise<TResponse> {
  const databaseConfig = resolveDatabaseConfig()
  const databaseContext = await openDatabaseContext()
  const queryable = databaseContext.queryable

  try {
    return await handler({
      adapters: createIntegrationAdapters(),
      conversationStore: createDatabaseConversationStore(queryable),
      emailCredentialsRepository:
        createDatabaseEmailCredentialsRepository(queryable),
      gbpStore: createDatabaseGbpStore(queryable),
      ...(databaseConfig.provider === "sqlite"
        ? { legacySqliteDatabase: databaseContext.legacySqliteDatabase }
        : {}),
      oauthIdentityRepository: createDatabaseOAuthIdentityRepository(queryable),
      onboardingExtractionRepository:
        createDatabaseOnboardingExtractionRepository(queryable),
      postStore: createDatabasePostStore(queryable),
      sessionStore: createDatabaseSessionStore(queryable),
      storeProfileRepository: createDatabaseStoreProfileRepository(queryable),
    })
  } finally {
    await databaseContext.close()
  }
}
