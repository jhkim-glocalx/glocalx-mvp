import type { NextRequest } from "next/server"

import {
  confirmAdoptionSourceStates,
  gbpAccessActionRequestSchema,
} from "@glocalx/domain/gbp-access"
import type {
  GbpAccessAction,
  GbpAccessState,
} from "@glocalx/domain/gbp-access"
import type { GbpAccessRequestListEntry } from "@glocalx/db/support/gbp-access-store"
import type { AdminAuditAction } from "@/server/audit-log-store"
import { applyGbpAccessAction } from "@/server/gbp-access-view"
import {
  adoptionRejectedNoticeBody,
  postCampaignAssistantNotice,
} from "@/server/campaign-chat-notice"
import {
  attachOrgLocationToStore,
  findStoreAdoptedByGoogleLocation,
  storeHasAttachedGbpLocation,
} from "@glocalx/db/support/gbp-location-attach"
import { resolveGoogleOrgAccountName } from "@glocalx/integrations/google-org-auth"
import {
  notFoundResponse,
  parseAdminJson,
  withAdminRoute,
} from "@/server/route-database"

type RouteContext = {
  readonly params: Promise<{ readonly requestId: string }>
}

// Each operator action gets its own audit code so the log separates a guided
// forward step from a forced OVERRIDE; the store's guard makes a stale action a
// conflict, never a silent overwrite.
const auditActionByType: Record<GbpAccessAction["type"], AdminAuditAction> = {
  SEND_INVITE: "gbp_access_send_invite",
  MARK_PENDING: "gbp_access_mark_pending",
  CONFIRM_ADOPTION: "gbp_access_confirm_adoption",
  REJECT_ADOPTION: "gbp_access_reject_adoption",
  GRANT: "gbp_access_grant",
  REVOKE: "gbp_access_revoke",
  BLOCK: "gbp_access_block",
  OVERRIDE: "gbp_access_override",
}

function conflictResponse(currentState: string): Response {
  return Response.json(
    { status: "STATUS_CONFLICT", currentState },
    { status: 409 }
  )
}

export async function POST(request: NextRequest, routeContext: RouteContext) {
  const { requestId } = await routeContext.params
  const parsed = await parseAdminJson(request, gbpAccessActionRequestSchema)
  if (parsed.kind === "response") {
    return parsed.response
  }
  const action: GbpAccessAction = parsed.value

  return withAdminRoute(
    request,
    async (context) => {
      // The adoption guards run BEFORE the state transition is persisted: a
      // refused adoption must leave the request in its prior state, not
      // "granted with nothing attached" (#70). The checks are read-only, so
      // hoisting them ahead of the write is safe. The row is read again inside
      // applyGbpAccessAction — deliberate duplication: the guarded UPDATE's
      // expectedState check keeps the transition correct even if the two reads
      // disagree, and it only protects the state column, not cross-store
      // listing uniqueness (that window predates this route).
      let confirmAdoptionLocationId: string | null = null
      let confirmSnapshot: GbpAccessRequestListEntry | undefined
      if (action.type === "CONFIRM_ADOPTION") {
        const current =
          await context.gbpAccessStore.getGbpAccessListEntryById(requestId)
        if (current === undefined) {
          return notFoundResponse()
        }
        // This snapshot is handed to applyGbpAccessAction below as the ONE
        // read both guards and the guarded UPDATE key off — a row that moves
        // after this read becomes a conflict, never a transition the guards
        // did not see.
        confirmSnapshot = current
        // Guards only apply where CONFIRM_ADOPTION is a legal transition
        // (the domain machine's own source states). Any other state skips
        // them so the transition below answers STATUS_CONFLICT with
        // currentState — the stale-view contract the console's reload hint
        // depends on.
        if (
          (confirmAdoptionSourceStates as readonly GbpAccessState[]).includes(
            current.state
          )
        ) {
          // The operator's pick wins over the matcher's guess. The matcher compares
          // names and addresses; the operator built these listings by hand and is
          // the authority on which one is which.
          const googleLocationId =
            action.gbpLocationRef ?? current.gbpLocationRef
          if (googleLocationId === null || googleLocationId === undefined) {
            return Response.json(
              { status: "MISSING_LOCATION_REF" },
              { status: 409 }
            )
          }
          // A store that already has a listing has already been through adoption
          // or live setup; running it again would silently repoint a working
          // publish target onto whatever the operator picked this time.
          if (
            await storeHasAttachedGbpLocation(
              context.queryable,
              current.storeId
            )
          ) {
            return Response.json(
              { status: "STORE_ALREADY_HAS_LOCATION" },
              { status: 409 }
            )
          }
          // The picker shows every org listing regardless of who already owns it —
          // it has no way to know. Two stores attached to the same listing would
          // point both owners' publish paths at one Google location.
          const adoptedBy = await findStoreAdoptedByGoogleLocation(
            context.queryable,
            googleLocationId
          )
          if (adoptedBy !== undefined && adoptedBy !== current.storeId) {
            return Response.json(
              { status: "LOCATION_ALREADY_ADOPTED" },
              { status: 409 }
            )
          }
          confirmAdoptionLocationId = googleLocationId
        }
      }

      const outcome = await applyGbpAccessAction(
        context.gbpAccessStore,
        requestId,
        action,
        new Date(),
        confirmSnapshot === undefined
          ? {}
          : {
              preloaded: confirmSnapshot,
              ...(action.type === "CONFIRM_ADOPTION" &&
              action.gbpLocationRef !== undefined
                ? { gbpLocationRef: action.gbpLocationRef }
                : {}),
            }
      )
      if (outcome.kind === "not_found") {
        return notFoundResponse()
      }
      if (outcome.kind === "conflict") {
        return conflictResponse(outcome.currentState)
      }

      // An adoption confirmed on an operator's word alone is only real once the
      // listing is attached: without these rows the owner is "granted" but the
      // publish path still has no location to post to.
      if (
        action.type === "CONFIRM_ADOPTION" &&
        confirmAdoptionLocationId !== null
      ) {
        // The operator's ref already rode the guarded UPDATE inside
        // applyGbpAccessAction (atomically with the state change), so the
        // returned row carries it and only the attach remains.
        await attachOrgLocationToStore(context.queryable, {
          accountId: `adopted-account-${outcome.request.storeId}`,
          accountName:
            resolveGoogleOrgAccountName(process.env) ?? "accounts/org",
          locationId: `adopted-location-${outcome.request.storeId}`,
          googleLocationId: confirmAdoptionLocationId,
          storeId: outcome.request.storeId,
          now: new Date(),
        })
      }

      if (action.type === "REJECT_ADOPTION") {
        await postCampaignAssistantNotice({
          csConversationStore: context.csConversationStore,
          csMessageStore: context.csMessageStore,
          storeId: outcome.request.storeId,
          body: adoptionRejectedNoticeBody(action.reason),
          now: new Date(),
        })
      }

      await context.auditLogStore.record({
        action: auditActionByType[action.type],
        adminUserId: context.adminUserId,
        storeId: outcome.request.storeId,
        detail: {
          requestId,
          toState: outcome.request.state,
          ...(action.type === "OVERRIDE"
            ? { targetState: action.targetState }
            : {}),
        },
      })

      return Response.json({ status: "OK", request: outcome.request })
    },
    { requireSameOrigin: true }
  )
}
