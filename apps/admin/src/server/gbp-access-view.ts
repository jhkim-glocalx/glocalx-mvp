import type {
  GbpAccessRequest,
  GbpAccessRequestListEntry,
  GbpAccessStore,
} from "@glocalx/db/support/gbp-access-store"
import {
  InvalidGbpAccessTransitionError,
  transitionGbpAccess,
} from "@glocalx/domain/gbp-access"
import type {
  GbpAccessAction,
  GbpAccessState,
} from "@glocalx/domain/gbp-access"

// Wire shape the Stores console and its routes share, mirroring queue-view.ts so
// the two never drift. The client derives the staleness "age" from updatedAt, so
// the view carries the raw timestamp rather than a pre-formatted label.
export type GbpAccessStoreView = {
  readonly requestId: string
  readonly storeId: string
  readonly storeName: string
  readonly state: GbpAccessState
  readonly gbpLocationRef: string | null
  readonly note: string | null
  readonly requestedAt: string
  readonly grantedAt: string | null
  readonly updatedAt: string
}

function toView(
  entry: GbpAccessRequest & { readonly storeName: string }
): GbpAccessStoreView {
  return {
    requestId: entry.id,
    storeId: entry.storeId,
    storeName: entry.storeName,
    state: entry.state,
    gbpLocationRef: entry.gbpLocationRef,
    note: entry.note,
    requestedAt: entry.requestedAt,
    grantedAt: entry.grantedAt,
    updatedAt: entry.updatedAt,
  }
}

export function toGbpAccessStoreView(
  entry: GbpAccessRequestListEntry
): GbpAccessStoreView {
  return toView(entry)
}

export type GbpAccessTransitionOutcome =
  | { readonly kind: "applied"; readonly request: GbpAccessStoreView }
  | { readonly kind: "not_found" }
  | { readonly kind: "conflict"; readonly currentState: GbpAccessState }

// Composes the pure domain state machine with the store's guarded write, exactly
// as applyCampaignAction does. Two distinct "your view was stale" causes both
// surface as `conflict`: the domain refusing the transition outright, and the
// guarded UPDATE matching zero rows. Keeping the transition here (not in
// packages/db) preserves the db→domain type-only boundary.
export async function applyGbpAccessAction(
  store: GbpAccessStore,
  requestId: string,
  action: GbpAccessAction,
  now: Date
): Promise<GbpAccessTransitionOutcome> {
  const current = await store.getGbpAccessListEntryById(requestId)
  if (current === undefined) {
    return { kind: "not_found" }
  }

  let nextState: GbpAccessState
  try {
    nextState = transitionGbpAccess(current.state, action)
  } catch (error) {
    if (error instanceof InvalidGbpAccessTransitionError) {
      return { kind: "conflict", currentState: current.state }
    }
    throw error
  }

  const updated = await store.updateGbpAccessState({
    requestId,
    expectedState: current.state,
    nextState,
    // A BLOCK carries its reason into the chase note so the Stores list explains
    // why a request stalled without a second operator action.
    note: action.type === "BLOCK" ? action.reason : undefined,
    now,
  })
  if (updated === undefined) {
    return { kind: "conflict", currentState: current.state }
  }

  // storeName can't change during a transition, so carry it from the pre-read.
  return {
    kind: "applied",
    request: toView({ ...updated, storeName: current.storeName }),
  }
}
