import type { NextRequest } from "next/server"

import { toGbpAccessStoreView } from "@/server/gbp-access-view"
import { withAdminRoute } from "@/server/route-database"

// The Stores section's GBP-access list: every store with a tracked access
// request, most stalled first (the store orders by updated_at asc). A store that
// has not completed GBP connect has no row yet and simply isn't listed.
export async function GET(request: NextRequest) {
  return withAdminRoute(request, async (context) => {
    const entries = await context.gbpAccessStore.listGbpAccessRequests()
    return Response.json({ stores: entries.map(toGbpAccessStoreView) })
  })
}
