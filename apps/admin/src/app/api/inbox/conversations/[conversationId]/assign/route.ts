import type { NextRequest } from "next/server"

import { toInboxConversationView } from "@/server/inbox-view"
import { notFoundResponse, withAdminRoute } from "@/server/route-database"

type ConversationRouteContext = {
  readonly params: Promise<{ readonly conversationId: string }>
}

// Assign-to-me: claims the conversation for the acting operator so the console
// shows who owns it. Audited so a reassignment is traceable.
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

      const now = new Date()
      await context.csConversationStore.assignAdmin(
        conversationId,
        context.adminUserId,
        now
      )
      await context.auditLogStore.record({
        action: "cs_assign",
        adminUserId: context.adminUserId,
        storeId: conversation.storeId,
        conversationId,
      })

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
