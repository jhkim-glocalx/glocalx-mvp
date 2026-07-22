import type { NextRequest } from "next/server"

import { toOwnerCampaignRequestView } from "@/campaigns/request-view"
import {
  readDatabaseSession,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"

type CampaignRequestRouteContext = {
  // Next canary provides dynamic route params as a promise in route handlers.
  readonly params: Promise<{ readonly requestId: string }>
}

function campaignRequestNotFoundResponse(): Response {
  return Response.json(
    { status: "NOT_FOUND", message: "요청을 찾을 수 없습니다." },
    { status: 404 }
  )
}

// The go/no-go screen's read: the finished material (processed assets + final
// copy) plus the decision trail, scoped to the owner's own store.
export async function GET(
  request: NextRequest,
  routeContext: CampaignRequestRouteContext
) {
  const { requestId } = await routeContext.params
  return withQueryableRouteDatabase(async (context) => {
    const session = await readDatabaseSession(request, context.sessionStore)
    if (session === undefined) {
      return requiredSessionResponse()
    }

    const detail = await context.campaignStore.getCampaignRequestDetail(
      requestId,
      session.storeId
    )
    if (detail === undefined) {
      return campaignRequestNotFoundResponse()
    }

    return Response.json({
      request: await toOwnerCampaignRequestView(
        context.adapters.mediaStore,
        detail
      ),
    })
  })
}
