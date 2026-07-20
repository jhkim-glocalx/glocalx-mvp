import type { NextRequest } from "next/server"

import {
  notFoundResponse,
  parseAdminJson,
  withAdminRoute,
} from "@/server/route-database"
import { csAdminDiscardDraftRequestSchema } from "@glocalx/domain/support/contracts"

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

// Discard an AI draft (delivery-plan Phase 2 §2): the operator rejects the
// composed reply and writes their own instead. The draft is deleted, never
// owner-visible. Guarded on status='draft', so discarding an already-sent or
// already-discarded id is a no-op. Audited.
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
        csAdminDiscardDraftRequestSchema
      )
      if (parsed.kind === "response") {
        return parsed.response
      }

      const conversation =
        await context.csConversationStore.getConversationById(conversationId)
      if (conversation === undefined) {
        return notFoundResponse()
      }

      const discarded = await context.csMessageStore.discardDraft(
        parsed.value.messageId
      )
      if (!discarded) {
        return draftNotPendingResponse()
      }
      await context.auditLogStore.record({
        action: "cs_discard_draft",
        adminUserId: context.adminUserId,
        storeId: conversation.storeId,
        conversationId,
        detail: { messageId: parsed.value.messageId },
      })

      return Response.json({ discarded: true })
    },
    { requireSameOrigin: true }
  )
}
