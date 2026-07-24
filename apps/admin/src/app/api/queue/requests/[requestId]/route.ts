import type { NextRequest } from "next/server"

import {
  campaignRequestNotFoundResponse,
  toQueueRequestResponse,
} from "@/app/api/queue/queue-responses"
import { withAdminRoute } from "@/server/route-database"

type QueueRequestRouteContext = {
  // Next canary provides dynamic route params as a promise in route handlers.
  readonly params: Promise<{ readonly requestId: string }>
}

export async function GET(
  request: NextRequest,
  routeContext: QueueRequestRouteContext
) {
  const { requestId } = await routeContext.params
  return withAdminRoute(request, async (context) => {
    const detail =
      await context.campaignStore.getCampaignRequestForOperator(requestId)
    if (detail === undefined) {
      return campaignRequestNotFoundResponse()
    }
    return Response.json({
      request: await toQueueRequestResponse(context, detail),
    })
  })
}
