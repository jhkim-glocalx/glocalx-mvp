import type { NextRequest } from "next/server"

import { onboardingSlotTurnRequestSchema } from "@/domain/schemas"
import { processOnboardingSlotTurn } from "@/onboarding/conversation"
import {
  parseJsonRoutePayload,
  readDemoSession,
  requiredSessionResponse,
  withRouteDatabase,
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

  return withRouteDatabase(async ({ adapters, database }) => {
    const result = await processOnboardingSlotTurn({
      adapters,
      database,
      request: parsed.value,
      storeId: session.storeId,
    })
    const status = result["status"] === "CONVERSATION_NOT_FOUND" ? 404 : 200
    return Response.json(result, { status })
  })
}
