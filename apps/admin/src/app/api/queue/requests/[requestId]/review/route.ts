import type { NextRequest } from "next/server"

import {
  campaignConflictResponse,
  campaignRequestNotFoundResponse,
  toQueueRequestResponse,
} from "@/app/api/queue/queue-responses"
import { applyCampaignAction } from "@/server/queue-view"
import { withAdminRoute } from "@/server/route-database"

type QueueRequestRouteContext = {
  readonly params: Promise<{ readonly requestId: string }>
}

function incompleteMaterialResponse(message: string): Response {
  return Response.json(
    { status: "INCOMPLETE_MATERIAL", message },
    { status: 422 }
  )
}

// Hand the finished material to the owner for go/no-go. Guarded on the material
// actually being finished: sending a request to review with no processed asset
// or no copy would put the owner in front of an empty approval screen, and the
// state machine can't express that — it only knows in_production is a legal
// source state.
export async function POST(
  request: NextRequest,
  routeContext: QueueRequestRouteContext
) {
  const { requestId } = await routeContext.params
  return withAdminRoute(
    request,
    async (context) => {
      const current =
        await context.campaignStore.getCampaignRequestForOperator(requestId)
      if (current === undefined) {
        return campaignRequestNotFoundResponse()
      }
      if (!current.assets.some((asset) => asset.kind === "processed")) {
        return incompleteMaterialResponse(
          "Upload at least one processed asset before sending this to the owner."
        )
      }
      if (current.finalCopy === null || current.finalCopy.trim().length === 0) {
        return incompleteMaterialResponse(
          "Write the final copy before sending this to the owner."
        )
      }

      const outcome = await applyCampaignAction(
        context.campaignStore,
        requestId,
        { type: "SUBMIT_FOR_REVIEW" },
        new Date()
      )
      if (outcome.kind === "not_found") {
        return campaignRequestNotFoundResponse()
      }
      if (outcome.kind === "conflict") {
        return campaignConflictResponse(outcome.currentStatus)
      }

      await context.auditLogStore.record({
        action: "campaign_submit_for_review",
        adminUserId: context.adminUserId,
        storeId: outcome.request.storeId,
        campaignRequestId: requestId,
      })

      return Response.json({
        request: await toQueueRequestResponse(context, outcome.request),
      })
    },
    { requireSameOrigin: true }
  )
}
