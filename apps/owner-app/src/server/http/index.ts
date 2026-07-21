import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import type { z } from "zod"

import {
  allowsLegacyTestSessions,
  authSessionCookieName,
  demoSessionCookieName,
  demoStoreCookieName,
  onboardingCompleteCookieName,
  sessionCookieOptions,
} from "@/auth/session"
import type { DemoSession } from "@/auth/session"
import { parseRoutePayload } from "@glocalx/domain"
import type { ParsedValidationIssue } from "@glocalx/domain"
import { createIntegrationAdapters } from "@glocalx/integrations"
import { openDatabaseContext, resolveDatabaseConfig } from "@glocalx/db"
import type { SqliteDatabase } from "@glocalx/db/sqlite"
import { createDatabaseActivityEventStore } from "@glocalx/db/support/activity-store"
import type { ActivityEventStore } from "@glocalx/db/support/activity-store"
import { createDatabaseCampaignStore } from "@glocalx/db/support/campaign-store"
import type { CampaignStore } from "@glocalx/db/support/campaign-store"
import { createDatabaseCsConversationStore } from "@glocalx/db/support/conversation-store"
import type { CsConversationStore } from "@glocalx/db/support/conversation-store"
import { createDatabaseCsMessageContextStore } from "@glocalx/db/support/message-context-store"
import type { CsMessageContextStore } from "@glocalx/db/support/message-context-store"
import { createDatabaseCsMessageStore } from "@glocalx/db/support/message-store"
import type { CsMessageStore } from "@glocalx/db/support/message-store"
import { createDatabaseConversationStore } from "@/server/repositories/conversation-store"
import type { ConversationStore } from "@/server/repositories/conversation-store"
import { createDatabaseAuthRateLimitRepository } from "@/server/repositories/auth-rate-limit"
import { createDatabaseEmailCredentialsRepository } from "@/server/repositories/email-credentials"
import { createDatabaseGbpStore } from "@/server/repositories/gbp-store"
import { createDatabaseOAuthIdentityRepository } from "@/server/repositories/oauth-identity"
import { createDatabaseOnboardingExtractionRepository } from "@/server/repositories/onboarding-extraction"
import { createDatabasePostStore } from "@/server/repositories/post-store"
import { createDatabaseSessionStore } from "@/server/repositories/session-store"
import type {
  AuthenticatedSession,
  SessionStore,
} from "@/server/repositories/session-store"
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
  readonly activityEventStore: ActivityEventStore
  readonly adapters: ReturnType<typeof createIntegrationAdapters>
  readonly authRateLimitRepository: ReturnType<
    typeof createDatabaseAuthRateLimitRepository
  >
  readonly campaignStore: CampaignStore
  readonly conversationStore: ConversationStore
  readonly csConversationStore: CsConversationStore
  readonly csMessageContextStore: CsMessageContextStore
  readonly csMessageStore: CsMessageStore
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

export function redirectWithSession({
  session,
  sessionId,
}: AuthenticatedSession): NextResponse {
  const response = new NextResponse(null, {
    headers: {
      Location: session.onboardingComplete ? "/app" : "/onboarding",
    },
    status: 303,
  })
  response.cookies.set(authSessionCookieName, sessionId, sessionCookieOptions)
  return response
}

export function rateLimitedResponse(retryAfterSeconds: number): NextResponse {
  return new NextResponse(null, {
    headers: { "Retry-After": String(retryAfterSeconds) },
    status: 429,
  })
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

function buildRouteDatabaseContext(
  databaseContext: Awaited<ReturnType<typeof openDatabaseContext>>,
  provider: ReturnType<typeof resolveDatabaseConfig>["provider"]
): QueryableRouteDatabaseContext {
  const queryable = databaseContext.queryable
  return {
    activityEventStore: createDatabaseActivityEventStore(queryable),
    adapters: createIntegrationAdapters(),
    authRateLimitRepository: createDatabaseAuthRateLimitRepository(queryable),
    campaignStore: createDatabaseCampaignStore(queryable),
    conversationStore: createDatabaseConversationStore(queryable),
    csConversationStore: createDatabaseCsConversationStore(queryable),
    csMessageContextStore: createDatabaseCsMessageContextStore(queryable),
    csMessageStore: createDatabaseCsMessageStore(queryable),
    emailCredentialsRepository:
      createDatabaseEmailCredentialsRepository(queryable),
    gbpStore: createDatabaseGbpStore(queryable),
    ...(provider === "sqlite"
      ? { legacySqliteDatabase: databaseContext.legacySqliteDatabase }
      : {}),
    oauthIdentityRepository: createDatabaseOAuthIdentityRepository(queryable),
    onboardingExtractionRepository:
      createDatabaseOnboardingExtractionRepository(queryable),
    postStore: createDatabasePostStore(queryable),
    sessionStore: createDatabaseSessionStore(queryable),
    storeProfileRepository: createDatabaseStoreProfileRepository(queryable),
  }
}

// Open a database context, run `handler` against the route stores, and always
// close the connection. Generic over the return type so background work
// scheduled with `after()` (which returns no Response) can reuse it — the
// out-of-band AI composition opens its own connection here because the owner
// request's context is already closed by the time it runs (architecture §5).
export async function withRouteDatabaseContext<TResult>(
  handler: (
    context: QueryableRouteDatabaseContext
  ) => Promise<TResult> | TResult
): Promise<TResult> {
  const databaseConfig = resolveDatabaseConfig()
  const databaseContext = await openDatabaseContext()

  try {
    return await handler(
      buildRouteDatabaseContext(databaseContext, databaseConfig.provider)
    )
  } finally {
    await databaseContext.close()
  }
}

export function withQueryableRouteDatabase<TResponse extends Response>(
  handler: (
    context: QueryableRouteDatabaseContext
  ) => Promise<TResponse> | TResponse
): Promise<TResponse> {
  return withRouteDatabaseContext(handler)
}
