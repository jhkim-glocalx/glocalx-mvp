import { randomUUID } from "node:crypto"

import type { NextRequest } from "next/server"

import { toInboxMessageView } from "@/server/inbox-view"
import {
  notFoundResponse,
  parseAdminJson,
  withAdminRoute,
} from "@/server/route-database"
import { csAdminReplyRequestSchema } from "@glocalx/domain/support/contracts"

type ConversationRouteContext = {
  readonly params: Promise<{ readonly conversationId: string }>
}

function conversationResolvedResponse(): Response {
  return Response.json(
    { status: "CONVERSATION_RESOLVED", message: "Conversation is resolved." },
    { status: 409 }
  )
}

// Operator reply. Written as sender='assistant', author_kind='admin' — the
// owner sees one assistant persona (architecture §2) while operations retains
// the true authorship. Replying implies the operator read the owner's
// messages, so it also clears the admin-side unread. Audited.
export async function POST(
  request: NextRequest,
  routeContext: ConversationRouteContext
) {
  const { conversationId } = await routeContext.params
  return withAdminRoute(
    request,
    async (context) => {
      const parsed = await parseAdminJson(request, csAdminReplyRequestSchema)
      if (parsed.kind === "response") {
        return parsed.response
      }

      const conversation =
        await context.csConversationStore.getConversationById(conversationId)
      if (conversation === undefined) {
        return notFoundResponse()
      }
      if (conversation.status === "resolved") {
        return conversationResolvedResponse()
      }

      const now = new Date()
      const message = await context.csMessageStore.appendMessage({
        id: randomUUID(),
        conversationId,
        sender: "assistant",
        authorKind: "admin",
        authorAdminId: context.adminUserId,
        body: parsed.value.body,
        now,
      })
      await context.csMessageStore.markAdminRead(conversationId, now)
      await context.csConversationStore.touch(conversationId, now)
      await context.auditLogStore.record({
        action: "cs_reply",
        adminUserId: context.adminUserId,
        storeId: conversation.storeId,
        conversationId,
        detail: { messageId: message.id },
      })

      return Response.json(
        { message: toInboxMessageView(message, undefined) },
        { status: 201 }
      )
    },
    { requireSameOrigin: true }
  )
}
