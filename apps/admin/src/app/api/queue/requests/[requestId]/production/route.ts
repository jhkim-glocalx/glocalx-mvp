import type { NextRequest } from "next/server"

import {
  campaignConflictResponse,
  campaignRequestNotFoundResponse,
  signQueueAssets,
} from "@/app/api/queue/queue-responses"
import { applyCampaignAction } from "@/server/queue-view"
import { withAdminRoute } from "@/server/route-database"

type QueueRequestRouteContext = {
  readonly params: Promise<{ readonly requestId: string }>
}

// Claim a submitted (or changes-requested) campaign into production. Audited so
// the queue's movement is traceable to an operator.
export async function POST(
  request: NextRequest,
  routeContext: QueueRequestRouteContext
) {
  const { requestId } = await routeContext.params
  return withAdminRoute(
    request,
    async (context) => {
      const outcome = await applyCampaignAction(
        context.campaignStore,
        requestId,
        { type: "START_PRODUCTION" },
        new Date()
      )
      if (outcome.kind === "not_found") {
        return campaignRequestNotFoundResponse()
      }
      if (outcome.kind === "conflict") {
        return campaignConflictResponse(outcome.currentStatus)
      }

      await context.auditLogStore.record({
        action: "campaign_start_production",
        adminUserId: context.adminUserId,
        storeId: outcome.request.storeId,
        campaignRequestId: requestId,
      })

      return Response.json({
        request: await signQueueAssets(
          context.adapters.mediaStore,
          outcome.request
        ),
      })
    },
    { requireSameOrigin: true }
  )
}
