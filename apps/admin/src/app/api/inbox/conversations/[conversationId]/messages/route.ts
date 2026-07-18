import type { NextRequest } from "next/server"

import {
  toInboxConversationView,
  toInboxMessageView,
} from "@/server/inbox-view"
import { notFoundResponse, withAdminRoute } from "@/server/route-database"
import { decodeMessageCursor } from "@glocalx/db/support/cursor"

type ConversationRouteContext = {
  readonly params: Promise<{ readonly conversationId: string }>
}

// Conversation detail poll. Opening (and re-polling) a conversation marks its
// owner messages read for the operator side — the operator is looking at it —
// so the inbox awaiting-reply badge clears. The list scan stays read-only.
export async function GET(
  request: NextRequest,
  routeContext: ConversationRouteContext
) {
  const { conversationId } = await routeContext.params
  return withAdminRoute(request, async (context) => {
    const conversation =
      await context.csConversationStore.getInboxConversationById(conversationId)
    if (conversation === undefined) {
      return notFoundResponse()
    }

    const rawCursor = request.nextUrl.searchParams.get("after")
    const after =
      rawCursor === null ? undefined : decodeMessageCursor(rawCursor)
    const page = await context.csMessageStore.listAdminMessages({
      conversationId,
      after,
    })

    const contexts = await context.csMessageContextStore.getContextsForMessages(
      page.messages.map((message) => message.id)
    )

    await context.csMessageStore.markAdminRead(conversationId, new Date())

    return Response.json({
      conversation: toInboxConversationView(conversation),
      messages: page.messages.map((message) =>
        toInboxMessageView(message, contexts.get(message.id))
      ),
      nextCursor: page.nextCursor,
    })
  })
}
