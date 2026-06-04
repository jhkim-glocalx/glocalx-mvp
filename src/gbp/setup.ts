import { z } from "zod"

import { locationStatusSchema } from "@/domain/location-status"
import type { LocationStatus } from "@/domain/location-status"
import { googleBusinessManageScope } from "@/integrations/credentials"
import type { IntegrationAdapters } from "@/integrations/contracts"
import type { SqliteDatabase } from "@/server/db/sqlite"

import { shouldScheduleGbpFollowUp } from "./state-machine"

const locationSpecBodySchema = z
  .object({
    status: locationStatusSchema,
  })
  .passthrough()

export type GbpSetupMode = "stub" | "production"

export type GbpSetupResult =
  | {
      readonly status: "VERIFICATION_PENDING" | "VERIFIED" | "CREATE_REQUESTED"
      readonly googleLocationId: string
      readonly oauthConnectionId: string
      readonly gbpLocationId: string
      readonly followUpJobId?: string
      readonly auditLogId: string
      readonly message: string
    }
  | {
      readonly status: "CLAIM_REQUIRED"
      readonly googleLocationId: string
      readonly requestAdminRightsUrl: string
      readonly followUpRequired: boolean
      readonly message: string
    }
  | {
      readonly status: "BLOCKED_BY_CREDENTIALS"
      readonly missingEnvVars: readonly string[]
      readonly message: string
    }

export type SetupGoogleBusinessProfileOptions = {
  readonly adapters: IntegrationAdapters
  readonly database: SqliteDatabase
  readonly mode: GbpSetupMode
  readonly storeId: string
}

export type BuildClaimRequiredResultOptions = {
  readonly googleLocationId: string
  readonly requestAdminRightsUrl: string
}

function addDays(date: Date, days: number): string {
  const nextDate = new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
  return nextDate.toISOString()
}

function locationStatusFromSpecBody(body: unknown): LocationStatus {
  const parsed = locationSpecBodySchema.safeParse(body)
  if (!parsed.success) {
    return "VERIFICATION_PENDING"
  }
  return parsed.data.status
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

function persistSetupRecords(
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

export function buildClaimRequiredResult(
  options: BuildClaimRequiredResultOptions
): GbpSetupResult {
  return {
    status: "CLAIM_REQUIRED",
    googleLocationId: options.googleLocationId,
    requestAdminRightsUrl: options.requestAdminRightsUrl,
    followUpRequired: true,
    message:
      "이미 소유자가 있는 Google 비즈니스 프로필입니다. 관리자 권한 요청을 진행해주세요.",
  }
}

export function setupGoogleBusinessProfile(
  options: SetupGoogleBusinessProfileOptions
): GbpSetupResult {
  const oauthResult = options.adapters.googleOAuth.connect()
  if (oauthResult.kind === "blocked_by_credentials") {
    return {
      status: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: oauthResult.missingEnvVars,
      message: "Google OAuth 인증 정보가 설정되지 않았습니다.",
    }
  }

  const locationResult = options.adapters.gbpBusinessInformation.createLocation(
    {
      accessToken: "stub-access-token",
      accountName: "accounts/stub",
      requestId: "setup-gbp-location",
      location: { title: "브런치모먼트 홍대점" },
    }
  )
  if (locationResult.kind === "blocked_by_credentials") {
    return {
      status: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: locationResult.missingEnvVars,
      message: "Google Business Profile 인증 정보가 설정되지 않았습니다.",
    }
  }

  return persistSetupRecords(
    options,
    locationStatusFromSpecBody(locationResult.value.body),
    oauthResult.value.subjectId
  )
}
