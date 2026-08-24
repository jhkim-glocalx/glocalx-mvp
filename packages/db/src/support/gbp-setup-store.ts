import type { LocationStatus } from "@glocalx/domain/location-status"
import type { GbpSetupResult } from "./gbp-setup"
import { shouldScheduleGbpFollowUp } from "@glocalx/domain/gbp-eligibility"
import type { Queryable } from "@glocalx/db"
import { z } from "zod"

const existingLocationRowSchema = z.object({
  googleLocationId: z.string().min(1),
  status: z.string(),
  requestAdminRightsUrl: z.string().nullable(),
})

export type ExistingGbpLocation = z.infer<typeof existingLocationRowSchema>

import {
  appendStubSetupAuditLog,
  persistStubOAuthConnection,
} from "./gbp-setup-auth-audit-store"
import {
  addDays,
  setupAccountId,
  setupAuditLogId,
  setupFollowUpJobId,
  setupGbpLocationId,
  setupGoogleLocationId,
  setupOAuthConnectionId,
  setupResultMessage,
  setupResultStatus,
  type PersistClaimRequiredGbpRecordsOptions,
  type PersistStubSetupGbpRecordsOptions,
} from "./gbp-setup-record-values"

async function upsertSetupAccount(options: {
  readonly createdAt: string
  readonly queryable: Queryable
  readonly storeId: string
  // Live setup stores the real org account resource name in account_name so the
  // publish path can build the accounts/{id}/locations/{id} parent from it.
  readonly googleAccountId?: string
  readonly accountName?: string
}): Promise<void> {
  await options.queryable.execute(
    `INSERT INTO gbp_accounts (
      id,
      store_id,
      google_account_id,
      account_name,
      created_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      store_id = excluded.store_id,
      google_account_id = excluded.google_account_id,
      account_name = excluded.account_name,
      created_at = excluded.created_at`,
    [
      setupAccountId(options.storeId),
      options.storeId,
      options.googleAccountId ?? "accounts/stub",
      options.accountName ?? "Stub GBP Account",
      options.createdAt,
    ]
  )
}

async function scheduleFollowUpIfNeeded(options: {
  readonly createdAt: string
  readonly now: Date
  readonly queryable: Queryable
  readonly status: LocationStatus
  readonly storeId: string
}): Promise<string | undefined> {
  if (!shouldScheduleGbpFollowUp(options.status)) {
    return undefined
  }

  await options.queryable.execute(
    `INSERT INTO job_runs (
      id,
      store_id,
      job_type,
      status,
      idempotency_key,
      run_after,
      attempts,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      store_id = excluded.store_id,
      job_type = excluded.job_type,
      status = excluded.status,
      idempotency_key = excluded.idempotency_key,
      run_after = excluded.run_after,
      attempts = excluded.attempts,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at`,
    [
      setupFollowUpJobId(options.storeId),
      options.storeId,
      "GBP_FOLLOW_UP",
      "SCHEDULED",
      `setup-gbp-follow-up-key-${options.storeId}`,
      addDays(options.now, 7),
      0,
      options.createdAt,
      options.createdAt,
    ]
  )
  return setupFollowUpJobId(options.storeId)
}

async function upsertSetupLocation(options: {
  readonly createdAt: string
  readonly googleLocationId: string
  readonly queryable: Queryable
  readonly requestAdminRightsUrl: string | null
  readonly status: LocationStatus
  readonly storeId: string
}): Promise<void> {
  await options.queryable.execute(
    `INSERT INTO gbp_locations (
      id,
      store_id,
      gbp_account_id,
      google_location_id,
      status,
      request_admin_rights_url,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      store_id = excluded.store_id,
      gbp_account_id = excluded.gbp_account_id,
      google_location_id = excluded.google_location_id,
      status = excluded.status,
      request_admin_rights_url = excluded.request_admin_rights_url,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at`,
    [
      setupGbpLocationId(options.storeId),
      options.storeId,
      setupAccountId(options.storeId),
      options.googleLocationId,
      options.status,
      options.requestAdminRightsUrl,
      options.createdAt,
      options.createdAt,
    ]
  )
}

// Does this store already point at a real Google listing? Setup reads this
// before provisioning so it never creates a second listing for a business that
// already has one — the failure mode that motivated the whole adoption flow, and
// one the stable requestId cannot catch (that id is derived from our own store
// row, so it can never match a listing created outside the app).
export async function readExistingGbpLocation(
  queryable: Queryable,
  storeId: string
): Promise<ExistingGbpLocation | undefined> {
  const row = await queryable.queryOne(
    `SELECT google_location_id AS googleLocationId,
            status,
            request_admin_rights_url AS requestAdminRightsUrl
       FROM gbp_locations
      WHERE store_id = ? AND google_location_id IS NOT NULL
      LIMIT 1`,
    [storeId]
  )
  const parsed = existingLocationRowSchema.safeParse(row)
  return parsed.success ? parsed.data : undefined
}

export async function persistClaimRequiredGbpRecords(
  options: PersistClaimRequiredGbpRecordsOptions
): Promise<void> {
  const createdAt = options.now.toISOString()
  await upsertSetupAccount({
    createdAt,
    queryable: options.queryable,
    storeId: options.storeId,
  })
  await upsertSetupLocation({
    createdAt,
    googleLocationId: options.claim.googleLocationId,
    queryable: options.queryable,
    requestAdminRightsUrl: options.claim.requestAdminRightsUrl,
    status: "CLAIM_REQUIRED",
    storeId: options.storeId,
  })
  await scheduleFollowUpIfNeeded({
    createdAt,
    now: options.now,
    queryable: options.queryable,
    status: "CLAIM_REQUIRED",
    storeId: options.storeId,
  })
}

export type PersistLiveSetupGbpRecordsOptions = {
  readonly accountName: string
  readonly actorUserId: string
  readonly googleLocationId: string
  readonly now: Date
  readonly queryable: Queryable
  readonly status: LocationStatus
  readonly storeId: string
}

export type PersistLiveClaimRequiredGbpRecordsOptions =
  PersistClaimRequiredGbpRecordsOptions & {
    readonly accountName: string
  }

// The live counterpart of persistStubSetupGbpRecords: it writes the real org
// account resource name and the Google-issued location id instead of the fixed
// stub placeholders, and records no owner oauth_connections row because the org
// account (not the owner) supplies the publish token.
export async function persistLiveSetupGbpRecords(
  options: PersistLiveSetupGbpRecordsOptions
): Promise<GbpSetupResult> {
  const createdAt = options.now.toISOString()
  await upsertSetupAccount({
    accountName: options.accountName,
    createdAt,
    googleAccountId: options.accountName,
    queryable: options.queryable,
    storeId: options.storeId,
  })
  await upsertSetupLocation({
    createdAt,
    googleLocationId: options.googleLocationId,
    queryable: options.queryable,
    requestAdminRightsUrl: null,
    status: options.status,
    storeId: options.storeId,
  })
  const followUpJobId = await scheduleFollowUpIfNeeded({
    createdAt,
    now: options.now,
    queryable: options.queryable,
    status: options.status,
    storeId: options.storeId,
  })
  await appendStubSetupAuditLog({
    action: "gbp.setup.live",
    actorUserId: options.actorUserId,
    createdAt,
    queryable: options.queryable,
    status: options.status,
    storeId: options.storeId,
  })

  const result = {
    status: setupResultStatus(options.status),
    googleLocationId: options.googleLocationId,
    oauthConnectionId: "org-managed",
    gbpLocationId: setupGbpLocationId(options.storeId),
    auditLogId: setupAuditLogId(options.storeId),
    message: setupResultMessage(options.status),
  }
  return followUpJobId === undefined ? result : { ...result, followUpJobId }
}

export async function persistLiveClaimRequiredGbpRecords(
  options: PersistLiveClaimRequiredGbpRecordsOptions
): Promise<void> {
  const createdAt = options.now.toISOString()
  await upsertSetupAccount({
    accountName: options.accountName,
    createdAt,
    googleAccountId: options.accountName,
    queryable: options.queryable,
    storeId: options.storeId,
  })
  await upsertSetupLocation({
    createdAt,
    googleLocationId: options.claim.googleLocationId,
    queryable: options.queryable,
    requestAdminRightsUrl: options.claim.requestAdminRightsUrl,
    status: "CLAIM_REQUIRED",
    storeId: options.storeId,
  })
  await scheduleFollowUpIfNeeded({
    createdAt,
    now: options.now,
    queryable: options.queryable,
    status: "CLAIM_REQUIRED",
    storeId: options.storeId,
  })
}

export async function persistStubSetupGbpRecords(
  options: PersistStubSetupGbpRecordsOptions
): Promise<GbpSetupResult> {
  const createdAt = options.now.toISOString()
  await persistStubOAuthConnection({ ...options, createdAt })
  await upsertSetupAccount({
    createdAt,
    queryable: options.queryable,
    storeId: options.storeId,
  })
  await upsertSetupLocation({
    createdAt,
    googleLocationId: setupGoogleLocationId(options.storeId),
    queryable: options.queryable,
    requestAdminRightsUrl: null,
    status: options.status,
    storeId: options.storeId,
  })
  const followUpJobId = await scheduleFollowUpIfNeeded({
    createdAt,
    now: options.now,
    queryable: options.queryable,
    status: options.status,
    storeId: options.storeId,
  })
  await appendStubSetupAuditLog({
    actorUserId: options.actorUserId,
    createdAt,
    queryable: options.queryable,
    status: options.status,
    storeId: options.storeId,
  })

  const result = {
    status: setupResultStatus(options.status),
    googleLocationId: setupGoogleLocationId(options.storeId),
    oauthConnectionId: setupOAuthConnectionId(options.storeId),
    gbpLocationId: setupGbpLocationId(options.storeId),
    auditLogId: setupAuditLogId(options.storeId),
    message: setupResultMessage(options.status),
  }
  return followUpJobId === undefined ? result : { ...result, followUpJobId }
}
