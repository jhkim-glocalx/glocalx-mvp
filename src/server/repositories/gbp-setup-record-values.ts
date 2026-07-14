import type { LocationStatus } from "@/domain/location-status"
import type {
  BuildClaimRequiredResultOptions,
  GbpSetupResult,
} from "@/gbp/setup"
import type { Queryable } from "@/server/db"

export type PersistClaimRequiredGbpRecordsOptions = {
  readonly claim: BuildClaimRequiredResultOptions
  readonly mode: "stub" | "production"
  readonly now: Date
  readonly queryable: Queryable
  readonly storeId: string
}

export type PersistStubSetupGbpRecordsOptions = {
  readonly accountDisplayName: string
  readonly accountName: string
  readonly googleLocationId: string
  readonly mode: "stub" | "production"
  readonly now: Date
  readonly queryable: Queryable
  readonly status: LocationStatus
  readonly storeId: string
  readonly subjectId: string
}

export const setupAccountId = "setup-gbp-account"
export const setupAuditLogId = "setup-gbp-audit"
export const setupGbpLocationId = "setup-gbp-location"
export const setupGoogleLocationId = "locations/stub-created"
export const setupOAuthConnectionId = "setup-oauth-google"
export const setupFollowUpJobId = "setup-gbp-follow-up"

export type GbpSetupRecordIds = {
  readonly accountId: string
  readonly auditLogId: string
  readonly followUpJobId: string
  readonly locationId: string
  readonly oauthConnectionId: string
}

export function gbpSetupRecordIds(
  storeId: string,
  mode: "stub" | "production"
): GbpSetupRecordIds {
  return mode === "stub"
    ? {
        accountId: setupAccountId,
        auditLogId: setupAuditLogId,
        followUpJobId: setupFollowUpJobId,
        locationId: setupGbpLocationId,
        oauthConnectionId: setupOAuthConnectionId,
      }
    : {
        accountId: `gbp-account-${storeId}`,
        auditLogId: `gbp-audit-${storeId}`,
        followUpJobId: `gbp-follow-up-${storeId}`,
        locationId: `gbp-location-${storeId}`,
        oauthConnectionId: `gbp-oauth-${storeId}`,
      }
}

export function addDays(date: Date, days: number): string {
  const nextDate = new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
  return nextDate.toISOString()
}

export function setupResultStatus(
  status: LocationStatus
): Extract<GbpSetupResult, { readonly auditLogId: string }>["status"] {
  return status === "VERIFIED" || status === "CREATE_REQUESTED"
    ? status
    : "VERIFICATION_PENDING"
}

export function setupResultMessage(status: LocationStatus): string {
  return status === "VERIFIED"
    ? "Google 비즈니스 프로필이 연결되었습니다."
    : "Google 비즈니스 프로필 생성 요청이 접수되었습니다. 인증 완료까지 기다려주세요."
}
