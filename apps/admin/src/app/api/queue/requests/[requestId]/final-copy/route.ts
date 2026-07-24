import type { NextRequest } from "next/server"

import {
  campaignConflictResponse,
  campaignRequestNotFoundResponse,
  toQueueRequestResponse,
} from "@/app/api/queue/queue-responses"
import { parseAdminJson, withAdminRoute } from "@/server/route-database"
import { setCampaignFinalCopyRequestSchema } from "@glocalx/domain/campaign-contracts"

type QueueRequestRouteContext = {
  readonly params: Promise<{ readonly requestId: string }>
}

// The caption that ships with the processed assets. Editable only while the
// request is in production — once the owner is looking at it, changing the copy
// underneath them would mean they approved something other than what they saw.
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
        setCampaignFinalCopyRequestSchema
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

      const updated = await context.campaignStore.setCampaignFinalCopy({
        requestId,
        finalCopy: parsed.value.finalCopy,
        now: new Date(),
      })
      if (updated === undefined) {
        return campaignRequestNotFoundResponse()
      }

      await context.auditLogStore.record({
        action: "campaign_set_final_copy",
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
