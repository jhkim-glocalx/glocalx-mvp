import type { GbpStore } from "@/server/repositories/gbp-store"
import { createDatabaseGbpStore } from "@/server/repositories/gbp-store"
import { createSqliteQueryable } from "@/server/db/sqlite-client"

import type {
  BuildClaimRequiredResultOptions,
  GbpSetupConnection,
  GbpSetupResult,
  SetupGoogleBusinessProfileOptions,
} from "./setup"

export async function readSetupConnection(
  options: SetupGoogleBusinessProfileOptions
): Promise<GbpSetupConnection | undefined> {
  const connection = await resolveGbpStore(options).readPerformanceConnection(
    options.storeId
  )
  return connection.kind === "ready" ? connection : undefined
}

class GbpPersistenceConfigurationError extends Error {
  readonly name = "GbpPersistenceConfigurationError"
}

export function createRegistrationIntent(
  options: SetupGoogleBusinessProfileOptions,
  registration: {
    readonly googleSubjectId: string
    readonly payloadDigest: string
  }
): Promise<string> {
  return resolveGbpStore(options).createRegistrationIntent({
    ...registration,
    now: options.adapters.clock.now(),
    storeId: options.storeId,
  })
}

export function consumeRegistrationIntent(
  options: SetupGoogleBusinessProfileOptions,
  registration: {
    readonly googleSubjectId: string
    readonly id: string
    readonly payloadDigest: string
  }
): Promise<boolean> {
  return resolveGbpStore(options).consumeRegistrationIntent({
    ...registration,
    now: options.adapters.clock.now(),
    storeId: options.storeId,
  })
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

export async function persistClaimRequiredRecords(
  options: SetupGoogleBusinessProfileOptions,
  claim: BuildClaimRequiredResultOptions
): Promise<void> {
  await resolveGbpStore(options).persistClaimRequiredRecords({
    claim,
    mode: options.mode,
    now: options.adapters.clock.now(),
    storeId: options.storeId,
  })
}

export function persistSetupRecords(
  options: SetupGoogleBusinessProfileOptions,
  registration: {
    readonly accountDisplayName: string
    readonly accountName: string
    readonly googleLocationId: string
    readonly status: Parameters<GbpStore["persistSetupRecords"]>[0]["status"]
  },
  subjectId: string
): Promise<GbpSetupResult> {
  return resolveGbpStore(options).persistSetupRecords({
    ...registration,
    mode: options.mode,
    now: options.adapters.clock.now(),
    storeId: options.storeId,
    subjectId,
  })
}
