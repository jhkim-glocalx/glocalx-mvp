import type { NextRequest } from "next/server"

import {
  campaignConflictResponse,
  campaignRequestNotFoundResponse,
  toQueueRequestResponse,
} from "@/app/api/queue/queue-responses"
import { withAdminRoute } from "@/server/route-database"

type QueueRequestRouteContext = {
  readonly params: Promise<{ readonly requestId: string }>
}

// The operator confirming they personally reached the owner about material
// waiting for go/no-go. v2 has no out-of-app notification, so this step — not
// the in-app assistant message — is what the <1-business-day promise actually
// rests on; Kakao notify (v2.1) automates exactly this call.
//
// Deliberately no request body: the operator is asserting one fact, and the
// timestamp is the server's. What they said, and on which channel, stays in
// their own thread with the owner.
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

      const updated = await context.campaignStore.markCampaignNudged({
        requestId,
        now: new Date(),
      })
      // The store's guard covers both ways this can miss — the request moved on,
      // or someone already marked it — so a stale panel is told to reload rather
      // than silently writing a second nudge.
      if (updated === undefined) {
        return campaignConflictResponse(current.status)
      }

      await context.auditLogStore.record({
        action: "campaign_mark_nudged",
        adminUserId: context.adminUserId,
        storeId: updated.storeId,
        campaignRequestId: requestId,
      })

      const detail =
        await context.campaignStore.getCampaignRequestForOperator(requestId)
      if (detail === undefined) {
        return campaignRequestNotFoundResponse()
      }
      return Response.json({
        request: await toQueueRequestResponse(context, detail),
      })
    },
    { requireSameOrigin: true }
  )
}
