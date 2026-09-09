import { randomUUID } from "node:crypto"

import type { NextRequest } from "next/server"
import { z } from "zod"

import { gbpSetupActionRequestSchema } from "@glocalx/domain/gbp-setup-action"
import { setupGoogleBusinessProfile } from "@glocalx/db/support/gbp-setup"
import { createDatabaseGbpStore } from "@glocalx/db/support/gbp-store"
import { createDatabaseStoreProfileRepository } from "@glocalx/db/support/store-profile"
import { createDatabaseGbpVerificationStore } from "@glocalx/db/support/gbp-verification-store"
import {
  attachOrgLocationToStore,
  findStoreAdoptedByGoogleLocation,
  storeHasAttachedGbpLocation,
} from "@glocalx/db/support/gbp-location-attach"
import { resolveGoogleOrgAccountName } from "@glocalx/integrations/google-org-auth"
import { applyGbpAccessAction } from "@/server/gbp-access-view"
import {
  gbpAttachedNoticeBody,
  postCampaignAssistantNotice,
} from "@/server/campaign-chat-notice"
import {
  notFoundResponse,
  parseAdminJson,
  withAdminRoute,
} from "@/server/route-database"

type RouteContext = {
  readonly params: Promise<{ readonly storeId: string }>
}

const storeOwnerRowSchema = z.object({
  name: z.string(),
  ownerUserId: z.string(),
})

// The concierge setup path: an operator runs GBP setup on an owner's behalf
// instead of walking them through the chat flow. Reuses the exact domain
// service the owner-app route calls (@glocalx/db/support/gbp-setup) — no
// admin-side reimplementation of the Google create/claim/verify logic.
export async function POST(request: NextRequest, routeContext: RouteContext) {
  const { storeId } = await routeContext.params
  const parsed = await parseAdminJson(request, gbpSetupActionRequestSchema)
  if (parsed.kind === "response") {
    return parsed.response
  }
  // A discriminated union so a new field-evidenced action adds a branch instead
  // of a route rewrite (Assignment in the design doc is still outstanding).
  const action = parsed.value

  return withAdminRoute(
    request,
    async (context) => {
      const storeRow = storeOwnerRowSchema.safeParse(
        await context.queryable.queryOne(
          `SELECT owner_user_id AS "ownerUserId", name FROM stores WHERE id = ?`,
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
            gbpStore: createDatabaseGbpStore(context.queryable),
            gbpVerificationStore: createDatabaseGbpVerificationStore(
              context.queryable
            ),
            mode: context.adapters.mode,
            storeId,
            storeProfileRepository: createDatabaseStoreProfileRepository(
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

        case "ATTACH_LOCATION": {
          // The owner never claimed anything here — an operator built the
          // listing in the Google UI and is connecting it — so the request row
          // may not exist yet. Ensuring it first is idempotent and never moves
          // a row an operator already advanced.
          const request = await context.gbpAccessStore.ensureGbpAccessRequest({
            id: randomUUID(),
            storeId,
            now: context.adapters.clock.now(),
          })

          // Both guards run BEFORE the transition, so a refused attach leaves
          // the request in its prior state rather than "granted with nothing
          // attached" (the #70 lesson the adoption route learned).
          if (await storeHasAttachedGbpLocation(context.queryable, storeId)) {
            return Response.json(
              { status: "STORE_ALREADY_HAS_LOCATION" },
              { status: 409 }
            )
          }
          // The org picker lists every listing regardless of who holds it, so
          // an operator can mis-pick one that is already another store's
          // publish target.
          const adoptedBy = await findStoreAdoptedByGoogleLocation(
            context.queryable,
            action.gbpLocationRef
          )
          if (adoptedBy !== undefined && adoptedBy !== storeId) {
            return Response.json(
              { status: "LOCATION_ALREADY_ADOPTED" },
              { status: 409 }
            )
          }

          const outcome = await applyGbpAccessAction(
            context.gbpAccessStore,
            request.id,
            action,
            context.adapters.clock.now(),
            {
              preloaded: { ...request, storeName: storeRow.data.name },
              gbpLocationRef: action.gbpLocationRef,
            }
          )
          if (outcome.kind === "not_found") {
            return notFoundResponse()
          }
          if (outcome.kind === "conflict") {
            return Response.json(
              { status: "STATUS_CONFLICT", currentState: outcome.currentState },
              { status: 409 }
            )
          }

          // Granted is only real once the listing is attached: without these
          // rows the owner is "connected" with nothing to publish to.
          await attachOrgLocationToStore(context.queryable, {
            accountId: `adopted-account-${storeId}`,
            accountName:
              resolveGoogleOrgAccountName(process.env) ?? "accounts/org",
            locationId: `adopted-location-${storeId}`,
            googleLocationId: action.gbpLocationRef,
            storeId,
            now: context.adapters.clock.now(),
          })

          // The owner asked about this in chat; the answer belongs in the same
          // thread, not only in a screen they would have to go look at.
          await postCampaignAssistantNotice({
            csConversationStore: context.csConversationStore,
            csMessageStore: context.csMessageStore,
            storeId,
            body: gbpAttachedNoticeBody(),
            now: context.adapters.clock.now(),
          })

          await context.auditLogStore.record({
            action: "gbp_access_attach_location",
            adminUserId: context.adminUserId,
            storeId,
            detail: {
              requestId: request.id,
              googleLocationId: action.gbpLocationRef,
              toState: outcome.request.state,
            },
          })

          return Response.json({ status: "OK", request: outcome.request })
        }
      }
    },
    { requireSameOrigin: true }
  )
}
