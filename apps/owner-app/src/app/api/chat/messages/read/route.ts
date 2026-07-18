import type { NextRequest } from "next/server"

import {
  readDatabaseSession,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"

// The owner opened the panel: clear assistant messages as read. Idempotent —
// re-marking an already-read conversation simply reports zero unread.
export async function POST(request: NextRequest) {
  return withQueryableRouteDatabase(async (context) => {
    const session = await readDatabaseSession(request, context.sessionStore)
    if (session === undefined) {
      return requiredSessionResponse()
    }

    const conversation =
      await context.csConversationStore.getOpenConversationForStore(
        session.storeId
      )
    if (conversation === undefined) {
      return Response.json({ unreadCount: 0 })
    }

    await context.csMessageStore.markOwnerRead(conversation.id, new Date())
    return Response.json({ unreadCount: 0 })
  })
}
