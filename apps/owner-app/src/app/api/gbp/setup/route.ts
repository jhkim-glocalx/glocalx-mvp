import { randomUUID } from "node:crypto"

import type { NextRequest } from "next/server"

import { gbpSetupRequestSchema } from "@glocalx/domain"
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
    async ({
      adapters,
      gbpAccessStore,
      gbpStore,
      gbpVerificationStore,
      sessionStore,
      storeProfileRepository,
    }) => {
      const session = await readDatabaseSession(request, sessionStore)
      if (session === undefined) {
        return requiredSessionResponse()
      }

      const result = await setupGoogleBusinessProfile({
        adapters,
        env: process.env,
        gbpStore,
        gbpVerificationStore,
        mode: parsed.value.mode,
        storeId: session.storeId,
        storeProfileRepository,
      })

      // A result carrying a googleLocationId is one that reached Google (created
      // or claim-required), which means the owner has connected their GBP, so
      // start tracking the org manager-access request. Blocks before that point
      // (missing credentials/profile/category, ungeocodable address, upstream
      // error) carry no location ref and are skipped. Idempotent on the store:
      // re-running setup returns the existing row and never resets
      // operator-advanced state.
      if ("googleLocationId" in result) {
        await gbpAccessStore.ensureGbpAccessRequest({
          id: randomUUID(),
          storeId: session.storeId,
          gbpLocationRef: result.googleLocationId,
          now: adapters.clock.now(),
        })
      }

      return Response.json(result)
    }
  )
}
