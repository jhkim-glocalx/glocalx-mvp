import type { LocationStatus } from "@/domain/location-status"
import type { GbpSetupResult } from "@/gbp/setup"
import { shouldScheduleGbpFollowUp } from "@/gbp/state-machine"
import type { Queryable } from "@/server/db"

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
      setupAccountId,
      options.storeId,
      "accounts/stub",
      "Stub GBP Account",
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
      setupFollowUpJobId,
      options.storeId,
      "GBP_FOLLOW_UP",
      "SCHEDULED",
      "setup-gbp-follow-up-key",
      addDays(options.now, 7),
      0,
      options.createdAt,
      options.createdAt,
    ]
  )
  return setupFollowUpJobId
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
      setupGbpLocationId,
      options.storeId,
      setupAccountId,
      options.googleLocationId,
      options.status,
      options.requestAdminRightsUrl,
      options.createdAt,
      options.createdAt,
    ]
  )
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
    googleLocationId: setupGoogleLocationId,
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
    createdAt,
    queryable: options.queryable,
    status: options.status,
    storeId: options.storeId,
  })

  const result = {
    status: setupResultStatus(options.status),
    googleLocationId: setupGoogleLocationId,
    oauthConnectionId: setupOAuthConnectionId,
    gbpLocationId: setupGbpLocationId,
    auditLogId: setupAuditLogId,
    message: setupResultMessage(options.status),
  }
  return followUpJobId === undefined ? result : { ...result, followUpJobId }
}
