import type { NextRequest } from "next/server"

import { toInboxConversationView } from "@/server/inbox-view"
import { withAdminRoute } from "@/server/route-database"
import type { CsConversationListFilter } from "@glocalx/db/support/conversation-store"

// The inbox list poll (5s). Read-only: opening a conversation is what marks its
// owner messages read, never this list scan. Defaults to open conversations;
// `?status=resolved` or `?status=all` widen it for history.
export async function GET(request: NextRequest) {
  return withAdminRoute(request, async (context) => {
    const statusParam = request.nextUrl.searchParams.get("status")
    const filter: CsConversationListFilter | undefined =
      statusParam === "all"
        ? undefined
        : statusParam === "resolved"
          ? { status: "resolved" }
          : { status: "open" }

    const summaries =
      await context.csConversationStore.listInboxConversations(filter)
    return Response.json({
      conversations: summaries.map(toInboxConversationView),
    })
  })
}
