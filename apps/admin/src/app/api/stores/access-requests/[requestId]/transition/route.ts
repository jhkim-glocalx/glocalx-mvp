import type { NextRequest } from "next/server"

import { gbpAccessActionRequestSchema } from "@glocalx/domain/gbp-access"
import type { GbpAccessAction } from "@glocalx/domain/gbp-access"
import type { AdminAuditAction } from "@/server/audit-log-store"
import { applyGbpAccessAction } from "@/server/gbp-access-view"
import {
  notFoundResponse,
  parseAdminJson,
  withAdminRoute,
} from "@/server/route-database"

type RouteContext = {
  readonly params: Promise<{ readonly requestId: string }>
}

// Each operator action gets its own audit code so the log separates a guided
// forward step from a forced OVERRIDE; the store's guard makes a stale action a
// conflict, never a silent overwrite.
const auditActionByType: Record<GbpAccessAction["type"], AdminAuditAction> = {
  SEND_INVITE: "gbp_access_send_invite",
  MARK_PENDING: "gbp_access_mark_pending",
  GRANT: "gbp_access_grant",
  REVOKE: "gbp_access_revoke",
  BLOCK: "gbp_access_block",
  OVERRIDE: "gbp_access_override",
}

function conflictResponse(currentState: string): Response {
  return Response.json(
    { status: "STATUS_CONFLICT", currentState },
    { status: 409 }
  )
}

export async function POST(request: NextRequest, routeContext: RouteContext) {
  const { requestId } = await routeContext.params
  const parsed = await parseAdminJson(request, gbpAccessActionRequestSchema)
  if (parsed.kind === "response") {
    return parsed.response
  }
  const action: GbpAccessAction = parsed.value

  return withAdminRoute(
    request,
    async (context) => {
      const outcome = await applyGbpAccessAction(
        context.gbpAccessStore,
        requestId,
        action,
        new Date()
      )
      if (outcome.kind === "not_found") {
        return notFoundResponse()
      }
      if (outcome.kind === "conflict") {
        return conflictResponse(outcome.currentState)
      }

      await context.auditLogStore.record({
        action: auditActionByType[action.type],
        adminUserId: context.adminUserId,
        storeId: outcome.request.storeId,
        detail: {
          requestId,
          toState: outcome.request.state,
          ...(action.type === "OVERRIDE"
            ? { targetState: action.targetState }
            : {}),
        },
      })

      return Response.json({ status: "OK", request: outcome.request })
    },
    { requireSameOrigin: true }
  )
}
