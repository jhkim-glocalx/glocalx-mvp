import type { NextRequest } from "next/server"

import { withAdminRoute } from "@/server/route-database"

// Stores whose owner confirmed their profile but that have never run GBP
// setup — final submission is an admin-only action now, so these have no
// gbp_access_requests row (that row is only created once setup reaches
// Google) and would otherwise never show up in the Stores console.
export async function GET(request: NextRequest) {
  return withAdminRoute(request, async (context) => {
    const stores = await context.gbpAccessStore.listStoresPendingGbpSetup()
    return Response.json({ stores })
  })
}
