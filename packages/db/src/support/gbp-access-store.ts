import type { GbpAccessState } from "@glocalx/domain/gbp-access"
import { z } from "zod"

import type { Queryable } from "../types.ts"
import { nullableTimestampSchema, timestampSchema } from "./row-codecs.ts"

// Organization GBP manager-access tracking. Owner-facing reads are store-scoped;
// operator reads span every store. Every state change is driven by an operator
// action the caller has already validated through transitionGbpAccess in
// @glocalx/domain — this store is a dumb guarded-write primitive, mirroring
// campaign-store, so no runtime domain code leaks across the db→domain boundary.

export type GbpAccessRequest = {
  readonly id: string
  readonly storeId: string
  readonly gbpLocationRef: string | null
  readonly state: GbpAccessState
  readonly note: string | null
  readonly requestedAt: string
  readonly grantedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

// Operator-wide row plus the store name the dashboard renders. Staleness "age"
// is derived by the caller from updatedAt, which moves only on a state change.
export type GbpAccessRequestListEntry = GbpAccessRequest & {
  readonly storeName: string
}

export type EnsureGbpAccessRequestInput = {
  readonly id: string
  readonly storeId: string
  readonly gbpLocationRef?: string | undefined
  readonly now: Date
}

export type OpenAdoptionReviewInput = {
  readonly id: string
  readonly storeId: string
  // The org listing the owner's claim resolved to. Unlike ensureGbpAccessRequest
  // this is required: an adoption review with no candidate gives the operator
  // nothing to rule on.
  readonly gbpLocationRef: string
  readonly now: Date
}

export type OpenAdoptionReviewResult =
  | { readonly kind: "opened"; readonly request: GbpAccessRequest }
  // The store already has an access request that is past the point where an
  // adoption claim makes sense. Never overwrites it — an owner re-submitting a
  // claim must not reset operator-advanced state.
  | { readonly kind: "already_tracked"; readonly request: GbpAccessRequest }

// `expectedState` is the state the caller read before computing nextState
// through the domain transition function. It becomes the WHERE clause, so the
// state column itself is the concurrency token: a caller that lost the race
// updates zero rows and gets `undefined` back rather than clobbering the winner.
// note/gbpLocationRef are set-or-keep (undefined leaves the column untouched).
export type UpdateGbpAccessStateInput = {
  readonly requestId: string
  readonly expectedState: GbpAccessState
  readonly nextState: GbpAccessState
  readonly note?: string | undefined
  readonly gbpLocationRef?: string | undefined
  readonly now: Date
}

export type SetGbpAccessNoteInput = {
  readonly requestId: string
  readonly note: string
  readonly now: Date
}

export interface GbpAccessStore {
  // Get-or-create in not_requested, called when the owner completes GBP connect.
  // Idempotent on store_id: reconnecting returns the existing row untouched, so
  // operator-advanced state is never reset back to not_requested.
  ensureGbpAccessRequest(
    input: EnsureGbpAccessRequestInput
  ): Promise<GbpAccessRequest>
  // Opens an operator review of an owner's "this listing is already mine" claim.
  // Idempotent on store_id like ensureGbpAccessRequest, and equally refuses to
  // move a row that already exists.
  openAdoptionReview(
    input: OpenAdoptionReviewInput
  ): Promise<OpenAdoptionReviewResult>
  getGbpAccessRequestForStore(
    storeId: string
  ): Promise<GbpAccessRequest | undefined>
  getGbpAccessRequestById(
    requestId: string
  ): Promise<GbpAccessRequest | undefined>
  // Operator single-row read that carries the store name, so a transition can
  // return a fully-rendered list entry without a second query.
  getGbpAccessListEntryById(
    requestId: string
  ): Promise<GbpAccessRequestListEntry | undefined>
  listGbpAccessRequests(): Promise<readonly GbpAccessRequestListEntry[]>
  // Returns undefined when the guard missed — the row is gone or its state
  // moved on. Callers surface that as a stale-view conflict, never a retry.
  updateGbpAccessState(
    input: UpdateGbpAccessStateInput
  ): Promise<GbpAccessRequest | undefined>
  // Chase-note edit that annotates without advancing the flow. Deliberately
  // does NOT bump updated_at so a note never resets the staleness age the
  // dashboard reads from it.
  setGbpAccessNote(
    input: SetGbpAccessNoteInput
  ): Promise<GbpAccessRequest | undefined>
}

const gbpAccessRowSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  gbpLocationRef: z.string().nullable(),
  state: z.string(),
  note: z.string().nullable(),
  requestedAt: timestampSchema,
  grantedAt: nullableTimestampSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

const gbpAccessProjection = `
  id,
  store_id AS "storeId",
  gbp_location_ref AS "gbpLocationRef",
  state,
  note,
  requested_at AS "requestedAt",
  granted_at AS "grantedAt",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`

// Table-qualified twin for the operator list's join against stores.
const gbpAccessListProjection = `
  r.id,
  r.store_id AS "storeId",
  r.gbp_location_ref AS "gbpLocationRef",
  r.state,
  r.note,
  r.requested_at AS "requestedAt",
  r.granted_at AS "grantedAt",
  r.created_at AS "createdAt",
  r.updated_at AS "updatedAt"
`

function toGbpAccessRequest(row: unknown): GbpAccessRequest {
  const parsed = gbpAccessRowSchema.parse(row)
  return {
    ...parsed,
    state: parsed.state as GbpAccessState,
  }
}

async function readById(
  queryable: Queryable,
  requestId: string
): Promise<GbpAccessRequest | undefined> {
  const row = await queryable.queryOne(
    `SELECT ${gbpAccessProjection} FROM gbp_access_requests WHERE id = ?`,
    [requestId]
  )
  return row === undefined ? undefined : toGbpAccessRequest(row)
}

export function createDatabaseGbpAccessStore(
  queryable: Queryable
): GbpAccessStore {
  return {
    async ensureGbpAccessRequest(input) {
      const now = input.now.toISOString()
      await queryable.execute(
        `INSERT INTO gbp_access_requests (
           id, store_id, gbp_location_ref, state, note,
           requested_at, granted_at, created_at, updated_at
         ) VALUES (?, ?, ?, 'not_requested', NULL, ?, NULL, ?, ?)
         ON CONFLICT (store_id) DO NOTHING`,
        [input.id, input.storeId, input.gbpLocationRef ?? null, now, now, now]
      )
      const row = await queryable.queryOne(
        `SELECT ${gbpAccessProjection} FROM gbp_access_requests WHERE store_id = ?`,
        [input.storeId]
      )
      // The INSERT either created the row or conflicted onto an existing one; a
      // SELECT by store_id resolves to exactly one either way.
      return toGbpAccessRequest(row)
    },

    async openAdoptionReview(input) {
      const now = input.now.toISOString()
      const inserted = await queryable.execute(
        `INSERT INTO gbp_access_requests (
           id, store_id, gbp_location_ref, state, note,
           requested_at, granted_at, created_at, updated_at
         ) VALUES (?, ?, ?, 'adoption_review', NULL, ?, NULL, ?, ?)
         ON CONFLICT (store_id) DO NOTHING`,
        [input.id, input.storeId, input.gbpLocationRef, now, now, now]
      )
      const row = await queryable.queryOne(
        `SELECT ${gbpAccessProjection} FROM gbp_access_requests WHERE store_id = ?`,
        [input.storeId]
      )
      const request = toGbpAccessRequest(row)
      return inserted.changes > 0
        ? { kind: "opened", request }
        : { kind: "already_tracked", request }
    },

    async getGbpAccessRequestForStore(storeId) {
      const row = await queryable.queryOne(
        `SELECT ${gbpAccessProjection} FROM gbp_access_requests WHERE store_id = ?`,
        [storeId]
      )
      return row === undefined ? undefined : toGbpAccessRequest(row)
    },

    async getGbpAccessRequestById(requestId) {
      return readById(queryable, requestId)
    },

    async getGbpAccessListEntryById(requestId) {
      const row = await queryable.queryOne(
        `SELECT ${gbpAccessListProjection},
                s.name AS "storeName"
           FROM gbp_access_requests r
           JOIN stores s ON s.id = r.store_id
          WHERE r.id = ?`,
        [requestId]
      )
      if (row === undefined) {
        return undefined
      }
      return {
        ...toGbpAccessRequest(row),
        storeName: z.string().parse(row["storeName"]),
      }
    },

    async listGbpAccessRequests() {
      // Oldest-updated first surfaces the most stalled requests at the top of the
      // operator's Stores view, matching this section's whole purpose.
      const rows = await queryable.query(
        `SELECT ${gbpAccessListProjection},
                s.name AS "storeName"
           FROM gbp_access_requests r
           JOIN stores s ON s.id = r.store_id
          ORDER BY r.updated_at ASC`
      )
      return rows.map((row) => ({
        ...toGbpAccessRequest(row),
        storeName: z.string().parse(row["storeName"]),
      }))
    },

    async updateGbpAccessState(input) {
      const now = input.now.toISOString()
      // granted_at is stamped whenever the request enters granted (refreshed on a
      // re-grant) and otherwise left as-is, so it records when access was last
      // granted and survives a later revoke as history.
      const result = await queryable.execute(
        `UPDATE gbp_access_requests
            SET state = ?,
                note = COALESCE(?, note),
                gbp_location_ref = COALESCE(?, gbp_location_ref),
                granted_at = CASE WHEN ? = 'granted' THEN ? ELSE granted_at END,
                updated_at = ?
          WHERE id = ? AND state = ?`,
        [
          input.nextState,
          input.note ?? null,
          input.gbpLocationRef ?? null,
          input.nextState,
          now,
          now,
          input.requestId,
          input.expectedState,
        ]
      )
      if (result.changes === 0) {
        return undefined
      }
      return readById(queryable, input.requestId)
    },

    async setGbpAccessNote(input) {
      const result = await queryable.execute(
        `UPDATE gbp_access_requests SET note = ? WHERE id = ?`,
        [input.note, input.requestId]
      )
      if (result.changes === 0) {
        return undefined
      }
      return readById(queryable, input.requestId)
    },
  }
}
