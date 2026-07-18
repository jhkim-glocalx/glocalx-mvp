import { randomUUID } from "node:crypto"

import type { NextRequest } from "next/server"

import type { ActivityEventInsert } from "@glocalx/db/support/activity-store"
import { activityFlushRequestSchema } from "@glocalx/domain/support/contracts"
import { authSessionCookieName } from "@/auth/session"
import {
  parseJsonRoutePayload,
  readDatabaseSession,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"

// Periodic flush of the client ring buffer to activity_events for the operator
// store timeline (architecture §2). The payload is already constrained to the
// fixed action/section enums and the non-PII detail whitelist by the domain
// schema, so nothing here needs to re-sanitize free text.
export async function POST(request: NextRequest) {
  return withQueryableRouteDatabase(async (context) => {
    const session = await readDatabaseSession(request, context.sessionStore)
    if (session === undefined) {
      return requiredSessionResponse()
    }

    const parsed = await parseJsonRoutePayload(
      request,
      activityFlushRequestSchema
    )
    if (parsed.kind === "response") {
      return parsed.response
    }

    const sessionId = request.cookies.get(authSessionCookieName)?.value ?? null
    const inserts: readonly ActivityEventInsert[] = parsed.value.events.map(
      (event) => ({
        id: randomUUID(),
        storeId: session.storeId,
        sessionId,
        section: event.section,
        action: event.action,
        detail: event.detail,
        occurredAt: new Date(event.occurredAt),
      })
    )
    await context.activityEventStore.recordEvents(inserts)

    return Response.json({ recorded: inserts.length })
  })
}
