import type { LocationStatus } from "@glocalx/domain/location-status"
import type { BuildClaimRequiredResultOptions, GbpSetupResult } from "../setup"
import type { Queryable } from "@glocalx/db"

export type PersistClaimRequiredGbpRecordsOptions = {
  readonly claim: BuildClaimRequiredResultOptions
  readonly now: Date
  readonly queryable: Queryable
  readonly storeId: string
}

export type PersistStubSetupGbpRecordsOptions = {
  readonly actorUserId: string
  readonly now: Date
  readonly queryable: Queryable
  readonly status: LocationStatus
  readonly storeId: string
  readonly subjectId: string
}

// Store-scoped, not global: an id shared across stores turns every upsert
// below into a cross-store clobber (a second store's setup overwrites the
// first store's account/location/audit/job row instead of creating its own).
export const setupAccountId = (storeId: string): string =>
  `setup-gbp-account-${storeId}`
export const setupAuditLogId = (storeId: string): string =>
  `setup-gbp-audit-${storeId}`
export const setupGbpLocationId = (storeId: string): string =>
  `setup-gbp-location-${storeId}`
export const setupGoogleLocationId = (storeId: string): string =>
  `locations/stub-created-${storeId}`
export const setupOAuthConnectionId = (storeId: string): string =>
  `setup-oauth-google-${storeId}`
export const setupFollowUpJobId = (storeId: string): string =>
  `setup-gbp-follow-up-${storeId}`

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
