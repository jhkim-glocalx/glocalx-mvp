import type { GbpStore } from "./gbp-store"
import { createDatabaseGbpStore } from "./gbp-store"
import { createSqliteQueryable } from "@glocalx/db/sqlite-client"
import {
  createDatabaseGbpVerificationStore,
  type GbpVerificationStore,
} from "@glocalx/db/support/gbp-verification-store"

import type { GbpVerificationAttempt } from "./gbp-setup-verification"
import type {
  BuildClaimRequiredResultOptions,
  GbpSetupResult,
  SetupGoogleBusinessProfileOptions,
} from "./gbp-setup"

class GbpPersistenceConfigurationError extends Error {
  readonly name = "GbpPersistenceConfigurationError"
}

function resolveGbpStore(options: SetupGoogleBusinessProfileOptions): GbpStore {
  if (options.gbpStore !== undefined) {
    return options.gbpStore
  }
  if (options.database !== undefined) {
    return createDatabaseGbpStore(createSqliteQueryable(options.database))
  }
  throw new GbpPersistenceConfigurationError()
}

function resolveGbpVerificationStore(
  options: SetupGoogleBusinessProfileOptions
): GbpVerificationStore | undefined {
  if (options.gbpVerificationStore !== undefined) {
    return options.gbpVerificationStore
  }
  if (options.database !== undefined) {
    return createDatabaseGbpVerificationStore(
      createSqliteQueryable(options.database)
    )
  }
  return undefined
}

// Best-effort: the verification attempt is a bonus on top of a listing that
// already exists, so a missing store (no database wired) simply records nothing
// rather than failing setup.
export async function persistGbpVerificationState(
  options: SetupGoogleBusinessProfileOptions,
  googleLocationId: string,
  attempt: GbpVerificationAttempt
): Promise<void> {
  const store = resolveGbpVerificationStore(options)
  if (store === undefined) {
    return
  }
  await store.upsertVerificationState({
    storeId: options.storeId,
    googleLocationId,
    state: attempt.state,
    offeredMethods: attempt.offeredMethods,
    autoAttempted: attempt.autoAttempted,
    now: options.adapters.clock.now(),
  })
}

export async function persistClaimRequiredRecords(
  options: SetupGoogleBusinessProfileOptions,
  claim: BuildClaimRequiredResultOptions
): Promise<void> {
  await resolveGbpStore(options).persistClaimRequiredRecords({
    claim,
    now: options.adapters.clock.now(),
    storeId: options.storeId,
  })
}

export function persistSetupRecords(
  options: SetupGoogleBusinessProfileOptions,
  status: Parameters<GbpStore["persistSetupRecords"]>[0]["status"],
  subjectId: string
): Promise<GbpSetupResult> {
  return resolveGbpStore(options).persistSetupRecords({
    actorUserId: options.actorUserId,
    now: options.adapters.clock.now(),
    status,
    storeId: options.storeId,
    subjectId,
  })
}

export function persistLiveSetupRecords(
  options: SetupGoogleBusinessProfileOptions,
  status: Parameters<GbpStore["persistLiveSetupRecords"]>[0]["status"],
  accountName: string,
  googleLocationId: string
): Promise<GbpSetupResult> {
  return resolveGbpStore(options).persistLiveSetupRecords({
    accountName,
    actorUserId: options.actorUserId,
    googleLocationId,
    now: options.adapters.clock.now(),
    status,
    storeId: options.storeId,
  })
}

export async function persistLiveClaimRequiredRecords(
  options: SetupGoogleBusinessProfileOptions,
  claim: BuildClaimRequiredResultOptions,
  accountName: string
): Promise<void> {
  await resolveGbpStore(options).persistLiveClaimRequiredRecords({
    accountName,
    claim,
    now: options.adapters.clock.now(),
    storeId: options.storeId,
  })
}
