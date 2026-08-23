import type { NextRequest } from "next/server"

import { toPostDraftEntryView } from "@/server/post-draft-view"
import { withAdminRoute } from "@/server/route-database"

// Read-only feed of owner self-serve drafts, every store, newest first.
// Direct publish from the owner app is paused, so this is visibility only —
// no write actions live on this route.
export async function GET(request: NextRequest) {
  return withAdminRoute(request, async (context) => {
    const entries = await context.postDraftStore.listPostDraftsForOperator()
    return Response.json({ drafts: entries.map(toPostDraftEntryView) })
  })
}
