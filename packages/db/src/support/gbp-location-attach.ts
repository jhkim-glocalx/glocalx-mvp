import type { Queryable } from "../types.ts"

// Attaching an org-managed Google listing to a store after an operator confirms
// an owner's adoption claim.
//
// This is the write that makes a hand-built listing visible to the rest of the
// app: without gbp_accounts/gbp_locations rows the publish path has no parent to
// post to, so a confirmed adoption that skipped this would leave the owner
// "connected" and unable to publish.
//
// Status is VERIFIED because the org account already manages the listing — the
// verification the v1 state machine gates publishing on happened outside the app,
// which is the whole premise of adoption.

export type AttachOrgLocationInput = {
  readonly accountId: string
  readonly accountName: string
  readonly locationId: string
  readonly googleLocationId: string
  readonly storeId: string
  readonly now: Date
}

// The other store already sitting on this listing, if any. Nothing in the
// schema stops two stores from claiming the same google_location_id — an
// operator mis-picking from the org list would silently move a live listing's
// publish target to the wrong owner, so the caller checks before attaching.
export async function findStoreAdoptedByGoogleLocation(
  queryable: Queryable,
  googleLocationId: string
): Promise<string | undefined> {
  const row = await queryable.queryOne(
    `SELECT store_id FROM gbp_locations WHERE google_location_id = ?`,
    [googleLocationId]
  )
  return row === undefined ? undefined : String(row["store_id"])
}

// Whether a store already has a listing attached. Adoption exists for stores
// with none — running it again on one that already has a verified location
// would silently repoint an already-working publish target.
export async function storeHasAttachedGbpLocation(
  queryable: Queryable,
  storeId: string
): Promise<boolean> {
  const row = await queryable.queryOne(
    `SELECT id FROM gbp_locations WHERE store_id = ? AND google_location_id IS NOT NULL`,
    [storeId]
  )
  return row !== undefined
}

// Undoes attachOrgLocationToStore. OVERRIDE only ever rewound
// gbp_access_requests.state — the gbp_locations/gbp_accounts rows an adoption
// wrote stayed behind, so a wrongly-adopted listing stayed permanently
// attached even after an operator reverted the access state. Scoped to the
// deterministic adoption ids (`adopted-account-${storeId}` /
// `adopted-location-${storeId}`) so it can never touch a live-setup location.
export async function detachOrgLocationFromStore(
  queryable: Queryable,
  storeId: string
): Promise<void> {
  await queryable.execute(
    `DELETE FROM gbp_locations WHERE id = ? AND store_id = ?`,
    [`adopted-location-${storeId}`, storeId]
  )
  await queryable.execute(
    `DELETE FROM gbp_accounts WHERE id = ? AND store_id = ?`,
    [`adopted-account-${storeId}`, storeId]
  )
}

export async function attachOrgLocationToStore(
  queryable: Queryable,
  input: AttachOrgLocationInput
): Promise<void> {
  const now = input.now.toISOString()

  await queryable.execute(
    `INSERT INTO gbp_accounts (id, store_id, google_account_id, account_name, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO NOTHING`,
    [input.accountId, input.storeId, input.accountName, input.accountName, now]
  )

  await queryable.execute(
    `INSERT INTO gbp_locations (
       id, store_id, gbp_account_id, google_location_id, status,
       request_admin_rights_url, created_at, updated_at
     ) VALUES (?, ?, ?, ?, 'VERIFIED', NULL, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       google_location_id = excluded.google_location_id,
       status = excluded.status,
       updated_at = excluded.updated_at`,
    [
      input.locationId,
      input.storeId,
      input.accountId,
      input.googleLocationId,
      now,
      now,
    ]
  )
}
