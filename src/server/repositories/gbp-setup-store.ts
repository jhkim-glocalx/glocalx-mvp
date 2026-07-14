import type { LocationStatus } from "@/domain/location-status"
import type { GbpSetupResult } from "@/gbp/setup"
import { shouldScheduleGbpFollowUp } from "@/gbp/state-machine"
import type { Queryable } from "@/server/db"

import {
  appendSetupAuditLog,
  persistStubOAuthConnection,
} from "./gbp-setup-auth-audit-store"
import {
  addDays,
  gbpSetupRecordIds,
  setupGoogleLocationId,
  setupResultMessage,
  setupResultStatus,
  type PersistClaimRequiredGbpRecordsOptions,
  type PersistStubSetupGbpRecordsOptions,
} from "./gbp-setup-record-values"

async function upsertSetupAccount(options: {
  readonly accountDisplayName: string
  readonly accountId: string
  readonly accountName: string
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
      options.accountId,
      options.storeId,
      options.accountName,
      options.accountDisplayName,
      options.createdAt,
    ]
  )
}

async function scheduleFollowUpIfNeeded(options: {
  readonly createdAt: string
  readonly now: Date
  readonly followUpJobId: string
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
      options.followUpJobId,
      options.storeId,
      "GBP_FOLLOW_UP",
      "SCHEDULED",
      `${options.storeId}:setup-gbp-follow-up`,
      addDays(options.now, 7),
      0,
      options.createdAt,
      options.createdAt,
    ]
  )
  return options.followUpJobId
}

async function upsertSetupLocation(options: {
  readonly accountId: string
  readonly createdAt: string
  readonly googleLocationId: string
  readonly locationId: string
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
      options.locationId,
      options.storeId,
      options.accountId,
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
  const ids = gbpSetupRecordIds(options.storeId, options.mode)
  await upsertSetupAccount({
    accountDisplayName:
      options.claim.accountDisplayName ?? "Google Business Profile Account",
    accountId: ids.accountId,
    accountName: options.claim.accountName ?? "accounts/unknown",
    createdAt,
    queryable: options.queryable,
    storeId: options.storeId,
  })
  await upsertSetupLocation({
    accountId: ids.accountId,
    createdAt,
    googleLocationId: options.claim.googleLocationId,
    locationId: ids.locationId,
    queryable: options.queryable,
    requestAdminRightsUrl: options.claim.requestAdminRightsUrl,
    status: "CLAIM_REQUIRED",
    storeId: options.storeId,
  })
  await scheduleFollowUpIfNeeded({
    createdAt,
    followUpJobId: ids.followUpJobId,
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
  const ids = gbpSetupRecordIds(options.storeId, options.mode)
  if (options.mode === "stub") {
    await persistStubOAuthConnection({ ...options, createdAt })
  }
  const googleLocationId =
    options.mode === "stub" ? setupGoogleLocationId : options.googleLocationId
  await upsertSetupAccount({
    accountDisplayName: options.accountDisplayName,
    accountId: ids.accountId,
    accountName: options.accountName,
    createdAt,
    queryable: options.queryable,
    storeId: options.storeId,
  })
  await upsertSetupLocation({
    accountId: ids.accountId,
    createdAt,
    googleLocationId,
    locationId: ids.locationId,
    queryable: options.queryable,
    requestAdminRightsUrl: null,
    status: options.status,
    storeId: options.storeId,
  })
  const followUpJobId = await scheduleFollowUpIfNeeded({
    createdAt,
    followUpJobId: ids.followUpJobId,
    now: options.now,
    queryable: options.queryable,
    status: options.status,
    storeId: options.storeId,
  })
  await appendSetupAuditLog({
    auditLogId: ids.auditLogId,
    createdAt,
    mode: options.mode,
    queryable: options.queryable,
    status: options.status,
    storeId: options.storeId,
  })

  const result = {
    status: setupResultStatus(options.status),
    googleLocationId,
    oauthConnectionId: ids.oauthConnectionId,
    gbpLocationId: ids.locationId,
    auditLogId: ids.auditLogId,
    message: setupResultMessage(options.status),
  }
  return followUpJobId === undefined ? result : { ...result, followUpJobId }
}
