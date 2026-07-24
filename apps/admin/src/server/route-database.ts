import type { NextRequest } from "next/server"
import type { z } from "zod"

import { hasSameRequestOrigin } from "@/auth/request-origin"
import { adminSessionCookieName } from "@/auth/session"
import type { AdminSession } from "@/auth/session"
import { createAdminAuthStore } from "@/server/admin-auth-store"
import {
  createAdminAuditLogStore,
  type AdminAuditLogStore,
} from "@/server/audit-log-store"
import { openDatabaseContext } from "@glocalx/db"
import { createDatabaseCampaignStore } from "@glocalx/db/support/campaign-store"
import type { CampaignStore } from "@glocalx/db/support/campaign-store"
import { createDatabaseCsConversationStore } from "@glocalx/db/support/conversation-store"
import type { CsConversationStore } from "@glocalx/db/support/conversation-store"
import { createDatabaseCsMessageContextStore } from "@glocalx/db/support/message-context-store"
import type { CsMessageContextStore } from "@glocalx/db/support/message-context-store"
import { createDatabaseCsMessageStore } from "@glocalx/db/support/message-store"
import type { CsMessageStore } from "@glocalx/db/support/message-store"
import { createDatabaseSupportMetricsStore } from "@glocalx/db/support/metrics-store"
import type { OrgCredentialStore } from "@glocalx/db/support/org-credential-store"
import { createDatabaseOrgCredentialStore } from "@glocalx/db/support/org-credential-store"
import type { SupportMetricsStore } from "@glocalx/db/support/metrics-store"
import { createDatabasePublishJobStore } from "@glocalx/db/support/publish-job-store"
import type { PublishJobStore } from "@glocalx/db/support/publish-job-store"
import { createDatabasePublishTargetStore } from "@glocalx/db/support/publish-target-store"
import type { PublishTargetStore } from "@glocalx/db/support/publish-target-store"
import { parseRoutePayload } from "@glocalx/domain"
import type { ParsedValidationIssue } from "@glocalx/domain"
import { createIntegrationAdapters } from "@glocalx/integrations"

export type AdminRouteContext = {
  readonly session: AdminSession
  readonly adminUserId: string
  // Same adapter boundary the owner app uses — the queue needs MediaStore for
  // processed-asset uploads and for signing the originals it renders.
  readonly adapters: ReturnType<typeof createIntegrationAdapters>
  readonly auditLogStore: AdminAuditLogStore
  readonly campaignStore: CampaignStore
  readonly csConversationStore: CsConversationStore
  readonly csMessageContextStore: CsMessageContextStore
  readonly csMessageStore: CsMessageStore
  readonly orgCredentialStore: OrgCredentialStore
  readonly publishJobStore: PublishJobStore
  readonly publishTargetStore: PublishTargetStore
  readonly supportMetricsStore: SupportMetricsStore
}

type WithAdminRouteOptions = {
  // Mutations set this so a cross-site POST is rejected before it touches the
  // database, mirroring the login/logout origin guard.
  readonly requireSameOrigin?: boolean
}

export function adminAuthRequiredResponse(): Response {
  return Response.json(
    { status: "AUTH_REQUIRED", message: "Operator session required." },
    { status: 401 }
  )
}

export function invalidOriginResponse(): Response {
  return Response.json(
    { status: "INVALID_ORIGIN", message: "Cross-origin request rejected." },
    { status: 403 }
  )
}

export function notFoundResponse(): Response {
  return Response.json({ status: "NOT_FOUND" }, { status: 404 })
}

export function malformedJsonResponse(): Response {
  return Response.json(
    { status: "VALIDATION_ERROR", message: "Request body was not valid JSON." },
    { status: 400 }
  )
}

export function validationErrorResponse(
  issues: readonly ParsedValidationIssue[]
): Response {
  return Response.json({ status: "VALIDATION_ERROR", issues }, { status: 400 })
}

export type ParsedAdminJson<TValue> =
  | { readonly kind: "ok"; readonly value: TValue }
  | { readonly kind: "response"; readonly response: Response }

export async function parseAdminJson<TValue>(
  request: NextRequest,
  schema: z.ZodType<TValue>
): Promise<ParsedAdminJson<TValue>> {
  let payload: unknown
  try {
    payload = await request.json()
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { kind: "response", response: malformedJsonResponse() }
    }
    throw error
  }
  const parsed = parseRoutePayload(schema, payload)
  if (parsed.kind === "validation_error") {
    return {
      kind: "response",
      response: validationErrorResponse(parsed.issues),
    }
  }
  return { kind: "ok", value: parsed.value }
}

// Opens the shared database, resolves the operator session, and hands the CS
// stores to the handler — the admin-side analogue of the owner app's
// withQueryableRouteDatabase. An unauthenticated (or, for mutations, cross-
// origin) request never reaches the handler.
export async function withAdminRoute(
  request: NextRequest,
  handler: (context: AdminRouteContext) => Promise<Response> | Response,
  options: WithAdminRouteOptions = {}
): Promise<Response> {
  if (options.requireSameOrigin === true && !hasSameRequestOrigin(request)) {
    return invalidOriginResponse()
  }

  const databaseContext = await openDatabaseContext()
  try {
    const queryable = databaseContext.queryable
    const session = await createAdminAuthStore(queryable).readSession(
      request.cookies.get(adminSessionCookieName)?.value
    )
    if (session === undefined) {
      return adminAuthRequiredResponse()
    }

    return await handler({
      session,
      adminUserId: session.adminUserId,
      adapters: createIntegrationAdapters(),
      auditLogStore: createAdminAuditLogStore(queryable),
      campaignStore: createDatabaseCampaignStore(queryable),
      csConversationStore: createDatabaseCsConversationStore(queryable),
      csMessageContextStore: createDatabaseCsMessageContextStore(queryable),
      csMessageStore: createDatabaseCsMessageStore(queryable),
      orgCredentialStore: createDatabaseOrgCredentialStore(queryable),
      publishJobStore: createDatabasePublishJobStore(queryable),
      publishTargetStore: createDatabasePublishTargetStore(queryable),
      supportMetricsStore: createDatabaseSupportMetricsStore(queryable),
    })
  } finally {
    await databaseContext.close()
  }
}
