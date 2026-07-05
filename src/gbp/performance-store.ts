import type { SqliteDatabase } from "@/server/db/sqlite"
import { createSqliteQueryable } from "@/server/db/sqlite-client"
import type { GbpStore } from "@/server/repositories/gbp-store"
import { createDatabaseGbpStore } from "@/server/repositories/gbp-store"

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
