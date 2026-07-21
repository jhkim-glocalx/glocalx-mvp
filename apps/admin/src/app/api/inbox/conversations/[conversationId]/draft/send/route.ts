import type { NextRequest } from "next/server"

import { toInboxMessageView } from "@/server/inbox-view"
import {
  notFoundResponse,
  parseAdminJson,
  withAdminRoute,
} from "@/server/route-database"
import { csAdminSendDraftRequestSchema } from "@glocalx/domain/support/contracts"

type ConversationRouteContext = {
  readonly params: Promise<{ readonly conversationId: string }>
}

function draftNotPendingResponse(): Response {
  return Response.json(
    {
      status: "DRAFT_NOT_PENDING",
      message: "The draft was already sent or discarded.",
    },
    { status: 409 }
  )
}

// Send an AI draft to the owner (delivery-plan Phase 2 §2), optionally edited by
// the operator. The store promotes the `draft` row to `sent` with a fresh
// created_at, so the owner's cursor poll delivers it as the single assistant
// persona — the owner never learns it originated as an AI draft. Guarded on
// status='draft', so a double-send (two operators, or a retry) is a no-op.
// Sending implies the operator read the owner's messages, so it clears the
// admin-side unread. The send is scoped to the path conversation as well as the
// body's messageId, so a draft from another conversation 409s instead of being
// delivered there under this conversation's audit record. Audited.
export async function POST(
  request: NextRequest,
  routeContext: ConversationRouteContext
) {
  const { conversationId } = await routeContext.params
  return withAdminRoute(
    request,
    async (context) => {
      const parsed = await parseAdminJson(
        request,
        csAdminSendDraftRequestSchema
      )
      if (parsed.kind === "response") {
        return parsed.response
      }

      const conversation =
        await context.csConversationStore.getConversationById(conversationId)
      if (conversation === undefined) {
        return notFoundResponse()
      }

      const now = new Date()
      const sent = await context.csMessageStore.sendDraft({
        conversationId,
        messageId: parsed.value.messageId,
        body: parsed.value.body,
        now,
      })
      if (sent === undefined) {
        return draftNotPendingResponse()
      }
      await context.csMessageStore.markAdminRead(conversationId, now)
      await context.csConversationStore.touch(conversationId, now)
      await context.auditLogStore.record({
        action: "cs_send_draft",
        adminUserId: context.adminUserId,
        storeId: conversation.storeId,
        conversationId,
        detail: { messageId: sent.id },
      })

      return Response.json(
        { message: toInboxMessageView(sent, undefined) },
        { status: 201 }
      )
    },
    { requireSameOrigin: true }
  )
}
