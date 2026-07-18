import type { NextRequest } from "next/server"

import { toInboxConversationView } from "@/server/inbox-view"
import { notFoundResponse, withAdminRoute } from "@/server/route-database"

type ConversationRouteContext = {
  readonly params: Promise<{ readonly conversationId: string }>
}

// Resolve: closes the conversation, freeing the store's one-open slot (a later
// owner message opens a fresh conversation). Audited. Idempotent — resolving an
// already-resolved conversation simply returns its resolved state.
export async function POST(
  request: NextRequest,
  routeContext: ConversationRouteContext
) {
  const { conversationId } = await routeContext.params
  return withAdminRoute(
    request,
    async (context) => {
      const conversation =
        await context.csConversationStore.getConversationById(conversationId)
      if (conversation === undefined) {
        return notFoundResponse()
      }

      if (conversation.status !== "resolved") {
        const now = new Date()
        await context.csConversationStore.resolveConversation(
          conversationId,
          now
        )
        await context.auditLogStore.record({
          action: "cs_resolve",
          adminUserId: context.adminUserId,
          storeId: conversation.storeId,
          conversationId,
        })
      }

      const updated =
        await context.csConversationStore.getInboxConversationById(
          conversationId
        )
      if (updated === undefined) {
        return notFoundResponse()
      }
      return Response.json({
        conversation: toInboxConversationView(updated),
      })
    },
    { requireSameOrigin: true }
  )
}
