import type { SqliteDatabase } from "@glocalx/db/sqlite"
import { createSqliteQueryable } from "@glocalx/db/sqlite-client"
import type { GbpStore } from "@glocalx/db/support/gbp-store"
import { createDatabaseGbpStore } from "@glocalx/db/support/gbp-store"

export type GbpStoreSource = {
  readonly database?: SqliteDatabase
  readonly gbpStore?: GbpStore
}

export function resolveGbpStore(options: GbpStoreSource): GbpStore {
  if (options.gbpStore !== undefined) {
    return options.gbpStore
  }
  if (options.database !== undefined) {
    return createDatabaseGbpStore(createSqliteQueryable(options.database))
  }
  throw new Error("GBP performance persistence is not configured.")
}
