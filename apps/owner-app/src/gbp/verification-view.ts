import {
  gbpVerificationOwnerPhase,
  type GbpVerificationOwnerPhase,
  type GbpVerificationState,
} from "@glocalx/domain/gbp-verification-state"
import type { GbpVerificationStore } from "@glocalx/db/support/gbp-verification-store"
import type {
  AdapterEnvironment,
  ExternalFetch,
  GbpVerificationsAdapter,
  IntegrationMode,
} from "@glocalx/integrations/contracts"

import {
  resolveLiveGbpCredentials,
  type ResolveLiveGbpCredentialsResult,
} from "@glocalx/db/support/gbp-setup-live"
import { readGbpVerificationSnapshot } from "@glocalx/db/support/gbp-setup-verification"

// The owner's view of their own listing's verification progress, plus the on-view
// refresh that keeps it honest. The refresh is deliberately READ-ONLY — it never
// calls verify(AUTO) (a write whose result async-reverts), only re-reads Google's
// VoiceOfMerchantState + options and re-interprets. Production re-reads live;
// stub returns the persisted (create-time seeded) row untouched.

export type OwnerGbpVerificationView = {
  readonly state: GbpVerificationState
  readonly phase: GbpVerificationOwnerPhase
  readonly offeredMethods: readonly string[]
  readonly updatedAt: string
}

export type ResolveOwnerGbpVerificationOptions = {
  readonly store: GbpVerificationStore
  readonly verifications: GbpVerificationsAdapter
  readonly mode: IntegrationMode
  readonly storeId: string
  readonly env: AdapterEnvironment
  readonly fetchImpl: ExternalFetch
  readonly now: Date
  // Injectable for tests; defaults to the live org-token resolver, which does a
  // network token exchange the unit tests must not perform.
  readonly resolveCredentials?: (options: {
    readonly env: AdapterEnvironment
    readonly fetchImpl: ExternalFetch
  }) => Promise<ResolveLiveGbpCredentialsResult>
}

export async function resolveOwnerGbpVerification(
  options: ResolveOwnerGbpVerificationOptions
): Promise<OwnerGbpVerificationView | null> {
  const existing = await options.store.readVerificationState(options.storeId)
  if (existing === undefined) {
    // No row until setup creates the listing (live) or seeds it (stub).
    return null
  }

  let current = existing
  if (options.mode === "production") {
    current = (await refreshFromGoogle(options, existing)) ?? existing
  }

  return {
    state: current.state,
    phase: gbpVerificationOwnerPhase(current.state),
    offeredMethods: current.offeredMethods,
    updatedAt: current.updatedAt,
  }
}

async function refreshFromGoogle(
  options: ResolveOwnerGbpVerificationOptions,
  existing: Awaited<ReturnType<GbpVerificationStore["readVerificationState"]>>
): Promise<Awaited<ReturnType<GbpVerificationStore["readVerificationState"]>>> {
  if (existing === undefined) {
    return undefined
  }
  try {
    const resolveCredentials =
      options.resolveCredentials ?? resolveLiveGbpCredentials
    const credentials = await resolveCredentials({
      env: options.env,
      fetchImpl: options.fetchImpl,
    })
    if (credentials.kind !== "ok") {
      return existing
    }
    const snapshot = await readGbpVerificationSnapshot({
      verifications: options.verifications,
      accessToken: credentials.credentials.accessToken,
      locationName: existing.googleLocationId,
      fetchImpl: options.fetchImpl,
    })
    // A transient read miss yields UNKNOWN; overwriting a real prior verdict
    // (VERIFIED / NEEDS_CONCIERGE) with UNKNOWN would flicker the card to
    // "checking" on a blip, so only persist a decisive re-read.
    if (snapshot.state === "UNKNOWN") {
      return existing
    }
    await options.store.refreshVerificationState({
      storeId: options.storeId,
      state: snapshot.state,
      offeredMethods: snapshot.offeredMethods,
      now: options.now,
    })
    return options.store.readVerificationState(options.storeId)
  } catch {
    // Best-effort: a refresh failure leaves the persisted state in place rather
    // than erroring the owner's card.
    return existing
  }
}
