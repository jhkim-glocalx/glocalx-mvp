import type { NextRequest } from "next/server"

import { gbpSetupRequestSchema } from "@/domain/schemas"
import { setupGoogleBusinessProfile } from "@/gbp/setup"
import {
  parseJsonRoutePayload,
  readDemoSession,
  requiredSessionResponse,
  withRouteDatabase,
} from "@/server/http"

export async function POST(request: NextRequest) {
  const parsed = await parseJsonRoutePayload(request, gbpSetupRequestSchema)
  if (parsed.kind === "response") {
    return parsed.response
  }

  // GBP setup uses the authenticated store; the payload only selects stub/production mode.
  const session = readDemoSession(request)
  if (session === undefined) {
    return requiredSessionResponse()
  }

  return withRouteDatabase(async ({ adapters, database }) => {
    const result = await setupGoogleBusinessProfile({
      adapters,
      database,
      mode: parsed.value.mode,
      storeId: session.storeId,
    })
    return Response.json(result)
  })
}
