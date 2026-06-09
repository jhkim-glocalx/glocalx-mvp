import { googleBusinessManageScope } from "@/integrations/credentials"
import type { IntegrationAdapters } from "@/integrations/contracts"
import type { SqliteDatabase } from "@/server/db/sqlite"

import type {
  BuildClaimRequiredResultOptions,
  GbpSetupResult,
  SetupGoogleBusinessProfileOptions,
} from "./setup"
import { shouldScheduleGbpFollowUp } from "./state-machine"
import type { LocationStatus } from "@/domain/location-status"

function addDays(date: Date, days: number): string {
  const nextDate = new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
  return nextDate.toISOString()
}

function scheduleFollowUpIfNeeded(
  database: SqliteDatabase,
  adapters: IntegrationAdapters,
  storeId: string,
  status: LocationStatus
): string | undefined {
  if (!shouldScheduleGbpFollowUp(status)) {
    return undefined
  }

  const jobId = "setup-gbp-follow-up"
  database
    .prepare(
      "INSERT OR REPLACE INTO job_runs (id, store_id, job_type, status, idempotency_key, run_after, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      jobId,
      storeId,
      "GBP_FOLLOW_UP",
      "SCHEDULED",
      "setup-gbp-follow-up-key",
      addDays(adapters.clock.now(), 7),
      0,
      adapters.clock.now().toISOString(),
      adapters.clock.now().toISOString()
    )
  return jobId
}

export function persistClaimRequiredRecords(
  options: SetupGoogleBusinessProfileOptions,
  claim: BuildClaimRequiredResultOptions
): void {
  const createdAt = options.adapters.clock.now().toISOString()
  const accountId = "setup-gbp-account"
  const gbpLocationId = "setup-gbp-location"

  options.database
    .prepare(
      "INSERT OR REPLACE INTO gbp_accounts (id, store_id, google_account_id, account_name, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      accountId,
      options.storeId,
      "accounts/stub",
      "Stub GBP Account",
      createdAt
    )

  options.database
    .prepare(
      "INSERT OR REPLACE INTO gbp_locations (id, store_id, gbp_account_id, google_location_id, status, request_admin_rights_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      gbpLocationId,
      options.storeId,
      accountId,
      claim.googleLocationId,
      "CLAIM_REQUIRED",
      claim.requestAdminRightsUrl,
      createdAt,
      createdAt
    )

  scheduleFollowUpIfNeeded(
    options.database,
    options.adapters,
    options.storeId,
    "CLAIM_REQUIRED"
  )
}

export function persistSetupRecords(
  options: SetupGoogleBusinessProfileOptions,
  status: LocationStatus,
  subjectId: string
): GbpSetupResult {
  const createdAt = options.adapters.clock.now().toISOString()
  const accountId = "setup-gbp-account"
  const oauthConnectionId = "setup-oauth-google"
  const gbpLocationId = "setup-gbp-location"
  const googleLocationId = "locations/stub-created"
  const auditLogId = "setup-gbp-audit"

  options.database
    .prepare(
      "INSERT OR REPLACE INTO oauth_connections (id, store_id, provider, subject_id, encrypted_access_token, encrypted_refresh_token, scopes_json, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      oauthConnectionId,
      options.storeId,
      "GOOGLE",
      subjectId,
      "encrypted:stub-access-token",
      "encrypted:stub-refresh-token",
      JSON.stringify([googleBusinessManageScope]),
      "2026-06-05T00:00:00.000Z",
      createdAt
    )

  options.database
    .prepare(
      "INSERT OR REPLACE INTO gbp_accounts (id, store_id, google_account_id, account_name, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      accountId,
      options.storeId,
      "accounts/stub",
      "Stub GBP Account",
      createdAt
    )

  options.database
    .prepare(
      "INSERT OR REPLACE INTO gbp_locations (id, store_id, gbp_account_id, google_location_id, status, request_admin_rights_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      gbpLocationId,
      options.storeId,
      accountId,
      googleLocationId,
      status,
      null,
      createdAt,
      createdAt
    )

  const followUpJobId = scheduleFollowUpIfNeeded(
    options.database,
    options.adapters,
    options.storeId,
    status
  )

  options.database
    .prepare(
      "INSERT OR REPLACE INTO audit_logs (id, store_id, actor_user_id, action, idempotency_key, redacted_payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      auditLogId,
      options.storeId,
      "demo-owner",
      "gbp.setup.stub",
      "setup-gbp-audit-key",
      JSON.stringify({ accessToken: "[REDACTED]", status }),
      createdAt
    )

  const resultStatus =
    status === "VERIFIED" || status === "CREATE_REQUESTED"
      ? status
      : "VERIFICATION_PENDING"
  const message =
    status === "VERIFIED"
      ? "Google 비즈니스 프로필이 연결되었습니다."
      : "Google 비즈니스 프로필 생성 요청이 접수되었습니다. 인증 완료까지 기다려주세요."

  if (followUpJobId !== undefined) {
    return {
      status: resultStatus,
      googleLocationId,
      oauthConnectionId,
      gbpLocationId,
      followUpJobId,
      auditLogId,
      message,
    }
  }

  return {
    status: resultStatus,
    googleLocationId,
    oauthConnectionId,
    gbpLocationId,
    auditLogId,
    message,
  }
}
