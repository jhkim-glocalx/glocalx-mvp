import type { NextRequest } from "next/server"

import {
  campaignConflictResponse,
  campaignRequestNotFoundResponse,
  toQueueRequestResponse,
} from "@/app/api/queue/queue-responses"
import { parseAdminJson, withAdminRoute } from "@/server/route-database"
import { setCampaignCallToActionRequestSchema } from "@glocalx/domain/campaign-contracts"

type QueueRequestRouteContext = {
  readonly params: Promise<{ readonly requestId: string }>
}

// The button the campaign publishes with — a real CTA button on Google Business
// Profile, a labelled link at the end of the caption on Instagram. Gated to
// in_production for the same reason final-copy is: the owner approves what they
// were shown, and a button appearing after review would not be part of that.
export async function POST(
  request: NextRequest,
  routeContext: QueueRequestRouteContext
) {
  const { requestId } = await routeContext.params
  return withAdminRoute(
    request,
    async (context) => {
      const parsed = await parseAdminJson(
        request,
        setCampaignCallToActionRequestSchema
      )
      if (parsed.kind === "response") {
        return parsed.response
      }

      const current =
        await context.campaignStore.getCampaignRequestForOperator(requestId)
      if (current === undefined) {
        return campaignRequestNotFoundResponse()
      }
      if (current.status !== "in_production") {
        return campaignConflictResponse(current.status)
      }

      const updated = await context.campaignStore.setCampaignCallToAction({
        requestId,
        callToAction: parsed.value.callToAction,
        now: new Date(),
      })
      if (updated === undefined) {
        return campaignRequestNotFoundResponse()
      }

      await context.auditLogStore.record({
        action: "campaign_set_call_to_action",
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
