import type { NextRequest } from "next/server"

import { toInboxConversationView } from "@/server/inbox-view"
import {
  notFoundResponse,
  parseAdminJson,
  withAdminRoute,
} from "@/server/route-database"
import { csAdminSetModeRequestSchema } from "@glocalx/domain/support/contracts"

type ConversationRouteContext = {
  readonly params: Promise<{ readonly conversationId: string }>
}

// Per-conversation mode toggle (delivery-plan Phase 2 §3): an operator flips a
// conversation across `human`/`ai_draft`/`ai`. The change only affects the next
// owner message — composition triggers out-of-band from the owner's POST, not
// here — so flipping to `human` stops AI replies for the next turn, and flipping
// back resumes. A pending AI draft is left untouched (handing off to human keeps
// it editable, architecture §5). Audited.
export async function POST(
  request: NextRequest,
  routeContext: ConversationRouteContext
) {
  const { conversationId } = await routeContext.params
  return withAdminRoute(
    request,
    async (context) => {
      const parsed = await parseAdminJson(request, csAdminSetModeRequestSchema)
      if (parsed.kind === "response") {
        return parsed.response
      }

      const conversation =
        await context.csConversationStore.getConversationById(conversationId)
      if (conversation === undefined) {
        return notFoundResponse()
      }

      const now = new Date()
      await context.csConversationStore.setMode(
        conversationId,
        parsed.value.mode,
        now
      )
      await context.auditLogStore.record({
        action: "cs_set_mode",
        adminUserId: context.adminUserId,
        storeId: conversation.storeId,
        conversationId,
        detail: { mode: parsed.value.mode },
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
