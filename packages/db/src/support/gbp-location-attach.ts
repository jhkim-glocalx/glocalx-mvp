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
