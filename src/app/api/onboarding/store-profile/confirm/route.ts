import type { NextRequest } from "next/server"

import { confirmedStoreProfileSchema } from "@/domain/schemas"
import { confirmStoreProfile } from "@/onboarding/store-profile"
import {
  parseJsonRoutePayload,
  readDemoSession,
  requiredSessionResponse,
  withRouteDatabase,
} from "@/server/http"

export async function POST(request: NextRequest) {
  const parsed = await parseJsonRoutePayload(
    request,
    confirmedStoreProfileSchema
  )
  if (parsed.kind === "response") {
    return parsed.response
  }

  // Confirmation writes to the session store, not a client-selected store ID.
  const session = readDemoSession(request)
  if (session === undefined) {
    return requiredSessionResponse()
  }

  return withRouteDatabase(({ adapters, database }) =>
    Response.json(
      confirmStoreProfile({
        adapters,
        database,
        profile: parsed.value,
        storeId: session.storeId,
      })
    )
  )
}
