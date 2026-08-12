import {
  gbpVerificationStateSchema,
  type GbpVerificationState,
} from "@glocalx/domain/gbp-verification-state"
import { z } from "zod"

import type { Queryable } from "../types.ts"
import { jsonColumnSchema, timestampSchema } from "./row-codecs.ts"

// Per-store GBP verification state, written at create time and refreshed on-view.
// Lives in packages/db/src/support so both apps read it: the owner app renders
// the owner's verification card, the admin app fills the concierge queue with
// NEEDS_CONCIERGE listings.

export type StoreGbpVerification = {
  readonly storeId: string
  readonly googleLocationId: string
  readonly state: GbpVerificationState
  readonly offeredMethods: readonly string[]
  readonly autoAttempted: boolean
  readonly lastCheckedAt: string
  readonly updatedAt: string
}

export type UpsertGbpVerificationInput = {
  readonly storeId: string
  readonly googleLocationId: string
  readonly state: GbpVerificationState
  readonly offeredMethods: readonly string[]
  readonly autoAttempted: boolean
  readonly now: Date
}

// On-view refresh: a read-only re-check never re-runs verify(AUTO), so it must
// not touch auto_attempted, and the location it re-read is the one already on the
// row — so google_location_id and created_at stay put too.
export type RefreshGbpVerificationInput = {
  readonly storeId: string
  readonly state: GbpVerificationState
  readonly offeredMethods: readonly string[]
  readonly now: Date
}

export interface GbpVerificationStore {
  upsertVerificationState(input: UpsertGbpVerificationInput): Promise<void>
  refreshVerificationState(input: RefreshGbpVerificationInput): Promise<void>
  readVerificationState(
    storeId: string
  ): Promise<StoreGbpVerification | undefined>
  listVerificationStates(): Promise<readonly StoreGbpVerification[]>
}

const storeGbpVerificationRowSchema = z.object({
  storeId: z.string(),
  googleLocationId: z.string(),
  state: gbpVerificationStateSchema,
  offeredMethods: jsonColumnSchema(z.array(z.string())),
  // SQLite returns 0/1, Postgres returns an integer — either way, non-zero = true.
  autoAttempted: z.union([z.number(), z.boolean()]).transform(Boolean),
  lastCheckedAt: timestampSchema,
  updatedAt: timestampSchema,
})

export async function upsertGbpVerificationState(
  queryable: Queryable,
  input: UpsertGbpVerificationInput
): Promise<void> {
  const timestamp = input.now.toISOString()
  // One row per store: the unique store_id index drives ON CONFLICT DO UPDATE, so
  // each re-check overwrites in place. `excluded` is portable across SQLite and
  // Postgres; the generated id and created_at only take on first insert.
  await queryable.execute(
    `INSERT INTO gbp_verification_state
       (id, store_id, google_location_id, state, offered_methods, auto_attempted, last_checked_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (store_id) DO UPDATE SET
       google_location_id = excluded.google_location_id,
       state = excluded.state,
       offered_methods = excluded.offered_methods,
       auto_attempted = excluded.auto_attempted,
       last_checked_at = excluded.last_checked_at,
       updated_at = excluded.updated_at`,
    [
      crypto.randomUUID(),
      input.storeId,
      input.googleLocationId,
      input.state,
      JSON.stringify([...input.offeredMethods]),
      input.autoAttempted ? 1 : 0,
      timestamp,
      timestamp,
      timestamp,
    ]
  )
}

export async function refreshGbpVerificationState(
  queryable: Queryable,
  input: RefreshGbpVerificationInput
): Promise<void> {
  const timestamp = input.now.toISOString()
  // UPDATE only — an on-view refresh presupposes a row written at create time
  // (the location it re-reads came from that row). No row means nothing to
  // refresh, so a zero-row UPDATE is the correct no-op.
  await queryable.execute(
    `UPDATE gbp_verification_state
        SET state = ?,
            offered_methods = ?,
            last_checked_at = ?,
            updated_at = ?
      WHERE store_id = ?`,
    [
      input.state,
      JSON.stringify([...input.offeredMethods]),
      timestamp,
      timestamp,
      input.storeId,
    ]
  )
}

export async function readGbpVerificationState(
  queryable: Queryable,
  storeId: string
): Promise<StoreGbpVerification | undefined> {
  const row = await queryable.queryOne(
    `SELECT store_id AS "storeId",
            google_location_id AS "googleLocationId",
            state,
            offered_methods AS "offeredMethods",
            auto_attempted AS "autoAttempted",
            last_checked_at AS "lastCheckedAt",
            updated_at AS "updatedAt"
       FROM gbp_verification_state
      WHERE store_id = ?`,
    [storeId]
  )
  if (row === undefined) {
    return undefined
  }
  return storeGbpVerificationRowSchema.parse(row)
}

export async function listGbpVerificationStates(
  queryable: Queryable
): Promise<readonly StoreGbpVerification[]> {
  // The whole table: the admin concierge surface joins these onto the store list
  // by store_id, and there is one row per store, so the set stays small.
  const rows = await queryable.query(
    `SELECT store_id AS "storeId",
            google_location_id AS "googleLocationId",
            state,
            offered_methods AS "offeredMethods",
            auto_attempted AS "autoAttempted",
            last_checked_at AS "lastCheckedAt",
            updated_at AS "updatedAt"
       FROM gbp_verification_state`,
    []
  )
  return rows.map((row) => storeGbpVerificationRowSchema.parse(row))
}

export function createDatabaseGbpVerificationStore(
  queryable: Queryable
): GbpVerificationStore {
  return {
    upsertVerificationState(input) {
      return upsertGbpVerificationState(queryable, input)
    },
    refreshVerificationState(input) {
      return refreshGbpVerificationState(queryable, input)
    },
    readVerificationState(storeId) {
      return readGbpVerificationState(queryable, storeId)
    },
    listVerificationStates() {
      return listGbpVerificationStates(queryable)
    },
  }
}
