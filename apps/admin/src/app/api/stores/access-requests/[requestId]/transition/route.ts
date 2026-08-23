import type { NextRequest } from "next/server"

import { gbpAccessActionRequestSchema } from "@glocalx/domain/gbp-access"
import type { GbpAccessAction } from "@glocalx/domain/gbp-access"
import type { AdminAuditAction } from "@/server/audit-log-store"
import { applyGbpAccessAction } from "@/server/gbp-access-view"
import {
  adoptionRejectedNoticeBody,
  postCampaignAssistantNotice,
} from "@/server/campaign-chat-notice"
import { attachOrgLocationToStore } from "@glocalx/db/support/gbp-location-attach"
import { resolveGoogleOrgAccountName } from "@glocalx/integrations/google-org-auth"
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
  CONFIRM_ADOPTION: "gbp_access_confirm_adoption",
  REJECT_ADOPTION: "gbp_access_reject_adoption",
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

      // An adoption confirmed on an operator's word alone is only real once the
      // listing is attached: without these rows the owner is "granted" but the
      // publish path still has no location to post to.
      if (action.type === "CONFIRM_ADOPTION") {
        const googleLocationId = outcome.request.gbpLocationRef
        if (googleLocationId === null) {
          return Response.json(
            { status: "MISSING_LOCATION_REF" },
            { status: 409 }
          )
        }
        await attachOrgLocationToStore(context.queryable, {
          accountId: `adopted-account-${outcome.request.storeId}`,
          accountName:
            resolveGoogleOrgAccountName(process.env) ?? "accounts/org",
          locationId: `adopted-location-${outcome.request.storeId}`,
          googleLocationId,
          storeId: outcome.request.storeId,
          now: new Date(),
        })
      }

      if (action.type === "REJECT_ADOPTION") {
        await postCampaignAssistantNotice({
          csConversationStore: context.csConversationStore,
          csMessageStore: context.csMessageStore,
          storeId: outcome.request.storeId,
          body: adoptionRejectedNoticeBody(action.reason),
          now: new Date(),
        })
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
