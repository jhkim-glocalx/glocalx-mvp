import type { NextRequest } from "next/server"

import { onboardingSlotTurnRequestSchema } from "@/domain/schemas"
import { processOnboardingSlotTurn } from "@/onboarding/conversation"
import {
  parseJsonRoutePayload,
  readDatabaseSession,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"

export async function POST(request: NextRequest) {
  return withQueryableRouteDatabase(
    async ({ adapters, conversationStore, sessionStore }) => {
      const session = await readDatabaseSession(request, sessionStore)
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

      const result = await processOnboardingSlotTurn({
        adapters,
        conversationStore,
        request: parsed.value,
        storeId: session.storeId,
      })
      const status = result["status"] === "CONVERSATION_NOT_FOUND" ? 404 : 200
      return Response.json(result, { status })
    }
  )
}
