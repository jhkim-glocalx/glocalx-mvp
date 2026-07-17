import type { NextRequest } from "next/server"

import { confirmedStoreProfileSchema } from "@glocalx/domain"
import { confirmStoreProfile } from "@/onboarding/store-profile"
import {
  parseJsonRoutePayload,
  readDatabaseSession,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"

export async function POST(request: NextRequest) {
  const parsed = await parseJsonRoutePayload(
    request,
    confirmedStoreProfileSchema
  )
  if (parsed.kind === "response") {
    return parsed.response
  }

  return withQueryableRouteDatabase(
    async ({ adapters, sessionStore, storeProfileRepository }) => {
      // Confirmation writes to the session store, not a client-selected store ID.
      const session = await readDatabaseSession(request, sessionStore)
      if (session === undefined) {
        return requiredSessionResponse()
      }

      return Response.json(
        await confirmStoreProfile({
          adapters,
          profile: parsed.value,
          repository: storeProfileRepository,
          storeId: session.storeId,
        })
      )
    }
  )
}
