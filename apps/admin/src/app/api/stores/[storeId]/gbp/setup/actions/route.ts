import { randomUUID } from "node:crypto"

import type { NextRequest } from "next/server"
import { z } from "zod"

import { gbpSetupActionRequestSchema } from "@glocalx/domain/gbp-setup-action"
import { setupGoogleBusinessProfile } from "@glocalx/gbp-setup"
import { createDatabaseGbpSetupStore } from "@glocalx/gbp-setup/repository/gbp-setup-store"
import { createDatabaseGbpSetupStoreProfileReader } from "@glocalx/gbp-setup/repository/store-profile-store"
import { createDatabaseGbpVerificationStore } from "@glocalx/db/support/gbp-verification-store"
import {
  notFoundResponse,
  parseAdminJson,
  withAdminRoute,
} from "@/server/route-database"

type RouteContext = {
  readonly params: Promise<{ readonly storeId: string }>
}

const storeOwnerRowSchema = z.object({
  ownerUserId: z.string(),
})

// The concierge setup path: an operator runs GBP setup on an owner's behalf
// instead of walking them through the chat flow. Reuses the exact domain
// service the owner-app route calls (@glocalx/gbp-setup) — no admin-side
// reimplementation of the Google create/claim/verify logic.
export async function POST(request: NextRequest, routeContext: RouteContext) {
  const { storeId } = await routeContext.params
  const parsed = await parseAdminJson(request, gbpSetupActionRequestSchema)
  if (parsed.kind === "response") {
    return parsed.response
  }
  // Only member today (RUN_SETUP) — a discriminated union so the next
  // field-evidenced action (Assignment in the design doc) adds a branch
  // instead of a route rewrite.
  const action = parsed.value

  return withAdminRoute(
    request,
    async (context) => {
      const storeRow = storeOwnerRowSchema.safeParse(
        await context.queryable.queryOne(
          `SELECT owner_user_id AS "ownerUserId" FROM stores WHERE id = ?`,
          [storeId]
        )
      )
      if (!storeRow.success) {
        return notFoundResponse()
      }

      switch (action.type) {
        case "RUN_SETUP": {
          // actorUserId must be the store's OWNER — audit_logs.actor_user_id is
          // an FK into users(id), and operators live in admin_users, a
          // different table (the same constraint the CONFIRM_ADOPTION route
          // works around by leaving actor_user_id NULL on ITS OWN audit entry
          // below). The operator's identity is recorded there, in the detail
          // payload, not on the setup service's internal audit write.
          const result = await setupGoogleBusinessProfile({
            actorUserId: storeRow.data.ownerUserId,
            adapters: context.adapters,
            env: process.env,
            gbpAccessStore: context.gbpAccessStore,
            gbpStore: createDatabaseGbpSetupStore(context.queryable),
            gbpVerificationStore: createDatabaseGbpVerificationStore(
              context.queryable
            ),
            mode: context.adapters.mode,
            storeId,
            storeProfileRepository: createDatabaseGbpSetupStoreProfileReader(
              context.queryable
            ),
          })

          // Mirrors the owner-app route: a result carrying a googleLocationId
          // reached Google (created or claim-required), so start tracking the
          // org manager-access request the same way an owner-run setup would.
          if ("googleLocationId" in result) {
            await context.gbpAccessStore.ensureGbpAccessRequest({
              id: randomUUID(),
              storeId,
              gbpLocationRef: result.googleLocationId,
              now: context.adapters.clock.now(),
            })
          }

          await context.auditLogStore.record({
            action: "gbp_setup_run",
            adminUserId: context.adminUserId,
            storeId,
            detail: {
              status: result.status,
              ...("googleLocationId" in result
                ? { googleLocationId: result.googleLocationId }
                : {}),
            },
          })

          return Response.json({ status: "OK", result })
        }
      }
    },
    { requireSameOrigin: true }
  )
}
