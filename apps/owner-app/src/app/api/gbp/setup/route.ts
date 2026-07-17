import type { NextRequest } from "next/server"

import { gbpSetupRequestSchema } from "@/domain/schemas"
import { setupGoogleBusinessProfile } from "@/gbp/setup"
import {
  parseJsonRoutePayload,
  readDatabaseSession,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"

export async function POST(request: NextRequest) {
  const parsed = await parseJsonRoutePayload(request, gbpSetupRequestSchema)
  if (parsed.kind === "response") {
    return parsed.response
  }

  return withQueryableRouteDatabase(
    async ({ adapters, gbpStore, sessionStore, storeProfileRepository }) => {
      const session = await readDatabaseSession(request, sessionStore)
      if (session === undefined) {
        return requiredSessionResponse()
      }

      const result = await setupGoogleBusinessProfile({
        adapters,
        gbpStore,
        mode: parsed.value.mode,
        storeId: session.storeId,
        storeProfileRepository,
      })
      return Response.json(result)
    }
  )
}
