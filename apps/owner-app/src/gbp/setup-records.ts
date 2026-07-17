import type { GbpStore } from "@/server/repositories/gbp-store"
import { createDatabaseGbpStore } from "@/server/repositories/gbp-store"
import { createSqliteQueryable } from "@/server/db/sqlite-client"

import type {
  BuildClaimRequiredResultOptions,
  GbpSetupResult,
  SetupGoogleBusinessProfileOptions,
} from "./setup"

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
    now: options.adapters.clock.now(),
    status,
    storeId: options.storeId,
    subjectId,
  })
}
