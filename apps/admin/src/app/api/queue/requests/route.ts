import type { NextRequest } from "next/server"

import { toQueueEntryView } from "@/server/queue-view"
import { withAdminRoute } from "@/server/route-database"

// The kanban feed: every store's campaign requests, newest activity first. The
// client groups by status rather than the server returning pre-bucketed lists,
// so one poll refreshes every column.
export async function GET(request: NextRequest) {
  return withAdminRoute(request, async (context) => {
    const entries = await context.campaignStore.listCampaignQueue()
    return Response.json({ requests: entries.map(toQueueEntryView) })
  })
}
