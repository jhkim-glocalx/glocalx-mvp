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
        mode: parsed.value.mode,
        storeId: session.storeId,
        storeProfileRepository,
      })

      // A result that reached Google (anything but blocked-before-connect) means
      // the owner has connected their GBP, so start tracking the org
      // manager-access request. Idempotent on the store: re-running setup returns
      // the existing row and never resets operator-advanced state.
      if (
        result.status !== "BLOCKED_BY_CREDENTIALS" &&
        result.status !== "STORE_PROFILE_REQUIRED" &&
        result.status !== "SETUP_UPSTREAM_ERROR"
      ) {
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
