import type { NextRequest } from "next/server"

import { gbpAccessOwnerPhase } from "@glocalx/domain/gbp-access"
import {
  readDatabaseSession,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"

// The owner's view of their own store's org manager-access progress. Returns the
// coarse phase the status card renders plus the raw state (the owner's own
// store's, so not privileged) — never the operator-only note or timeline.
export async function GET(request: NextRequest) {
  return withQueryableRouteDatabase(
    async ({ gbpAccessStore, sessionStore }) => {
      const session = await readDatabaseSession(request, sessionStore)
      if (session === undefined) {
        return requiredSessionResponse()
      }

      const record = await gbpAccessStore.getGbpAccessRequestForStore(
        session.storeId
      )
      if (record === undefined) {
        // No row exists until the owner completes GBP connect (setup creates it).
        return Response.json({ status: "OK", access: null })
      }

      return Response.json({
        status: "OK",
        access: {
          state: record.state,
          phase: gbpAccessOwnerPhase(record.state),
          updatedAt: record.updatedAt,
        },
      })
    }
  )
}
