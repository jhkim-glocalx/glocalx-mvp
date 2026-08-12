import type { NextRequest } from "next/server"

import { resolveOwnerGbpVerification } from "@/gbp/verification-view"
import {
  readDatabaseSession,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"

// The owner's view of their own store's GBP listing verification, refreshed
// on-view: production re-reads Google's VoiceOfMerchantState (read-only, never
// re-verifies) so an async grant/denial shows up when the owner opens the card;
// stub returns the persisted state. Returns null until setup creates/seeds a row.
export async function GET(request: NextRequest) {
  return withQueryableRouteDatabase(
    async ({ adapters, gbpVerificationStore, sessionStore }) => {
      const session = await readDatabaseSession(request, sessionStore)
      if (session === undefined) {
        return requiredSessionResponse()
      }

      const verification = await resolveOwnerGbpVerification({
        store: gbpVerificationStore,
        verifications: adapters.gbpVerifications,
        mode: adapters.mode,
        storeId: session.storeId,
        env: process.env,
        fetchImpl: globalThis.fetch,
        now: adapters.clock.now(),
      })

      return Response.json({ status: "OK", verification })
    }
  )
}
