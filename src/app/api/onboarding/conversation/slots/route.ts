import type { NextRequest } from "next/server"

import { onboardingSlotTurnRequestSchema } from "@/domain/schemas"
import { processOnboardingSlotTurn } from "@/onboarding/conversation"
import {
  parseJsonRoutePayload,
  readDemoSession,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"

export async function POST(request: NextRequest) {
  // Slot turns are scoped to the session store before any client payload is used.
  const session = readDemoSession(request)
  if (session === undefined) {
    return requiredSessionResponse()
  }

  const parsed = await parseJsonRoutePayload(
    request,
    onboardingSlotTurnRequestSchema
  )
  if (parsed.kind === "response") {
    return parsed.response
  }

  return withQueryableRouteDatabase(async ({ adapters, conversationStore }) => {
    const result = await processOnboardingSlotTurn({
      adapters,
      conversationStore,
      request: parsed.value,
      storeId: session.storeId,
    })
    const status = result["status"] === "CONVERSATION_NOT_FOUND" ? 404 : 200
    return Response.json(result, { status })
  })
}
