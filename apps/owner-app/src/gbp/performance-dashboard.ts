import type { IntegrationAdapters } from "@/integrations/contracts"
import { gbpPerformanceDailyMetrics } from "@/integrations/contracts"
import type { SqliteDatabase } from "@/server/db/sqlite"
import type { GbpStore } from "@/server/repositories/gbp-store"

import {
  buildGbpPerformanceRanges,
  datesInRange,
  formatGbpPerformanceDate,
} from "./performance-dates"
import {
  summarizePerformanceMetrics,
  type PerformanceMetricSummary,
} from "./performance-metrics"
import { blocked, resolvePerformancePayload } from "./performance-payload"
import { resolveGbpStore } from "./performance-store"

export type GbpPerformanceFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response>

export type GbpPerformanceDashboardResult =
  | {
      readonly locationName: string
      readonly metrics: readonly PerformanceMetricSummary[]
      readonly range: {
        readonly endDate: string
        readonly previousEndDate: string
        readonly previousStartDate: string
        readonly startDate: string
      }
      readonly refreshedAt: string
      readonly status: "READY"
    }
  | {
      readonly code:
        | "AMBIGUOUS_GBP_LOCATION"
        | "GOOGLE_CREDENTIALS_MISSING"
        | "LOCATION_NOT_VERIFIED"
        | "MISSING_BUSINESS_MANAGE_SCOPE"
        | "MISSING_GOOGLE_CONNECTION"
        | "MISSING_GBP_LOCATION"
        | "TOKEN_UNAVAILABLE"
      readonly message: string
      readonly status: "BLOCKED"
    }
  | {
      readonly code:
        | "GOOGLE_AUTH_REQUIRED"
        | "GOOGLE_QUOTA_EXCEEDED"
        | "GOOGLE_RESPONSE_MALFORMED"
        | "GOOGLE_UPSTREAM_ERROR"
        | "GOOGLE_UPSTREAM_UNAVAILABLE"
      readonly message: string
      readonly status: "ERROR"
    }

export type GetGbpPerformanceDashboardOptions = {
  readonly adapters: IntegrationAdapters
  readonly database?: SqliteDatabase
  readonly fetchImpl?: GbpPerformanceFetch
  readonly gbpStore?: GbpStore
  readonly now?: Date
  readonly storeId: string
}

export async function getGbpPerformanceDashboard(
  options: GetGbpPerformanceDashboardOptions
): Promise<GbpPerformanceDashboardResult> {
  const gbpStore = resolveGbpStore(options)
  const location = await gbpStore.readPerformanceLocation(options.storeId)
  if (location.kind !== "ready") {
    if (location.kind === "missing_gbp_location") {
      return blocked(
        "MISSING_GBP_LOCATION",
        "연결된 Google Business Profile 매장을 찾지 못했습니다."
      )
    }
    if (location.kind === "ambiguous_gbp_location") {
      return blocked(
        "AMBIGUOUS_GBP_LOCATION",
        "Google Business Profile 매장이 여러 개입니다. 먼저 매장을 하나로 선택해주세요."
      )
    }
    return blocked(
      "LOCATION_NOT_VERIFIED",
      "Google Business Profile 인증이 완료되어야 성과를 볼 수 있습니다."
    )
  }

  const connection = await gbpStore.readPerformanceConnection(options.storeId)
  if (connection.kind !== "ready") {
    if (connection.kind === "missing_google_connection") {
      return blocked(
        "MISSING_GOOGLE_CONNECTION",
        "Google 계정 연결이 필요합니다."
      )
    }
    if (connection.kind === "missing_business_manage_scope") {
      return blocked(
        "MISSING_BUSINESS_MANAGE_SCOPE",
        "Google Business Profile 성과를 보려면 business.manage 권한이 필요합니다."
      )
    }
    return blocked(
      "TOKEN_UNAVAILABLE",
      "Google 연결 토큰을 읽지 못했습니다. 계정을 다시 연결해주세요."
    )
  }

  const now = options.now ?? new Date()
  const ranges = buildGbpPerformanceRanges(now)
  const fetchImpl = options.fetchImpl ?? fetch
  const current = await resolvePerformancePayload(
    options.adapters.gbpPerformance.fetchMultiDailyMetricsTimeSeries({
      accessToken: connection.accessToken,
      dailyMetrics: gbpPerformanceDailyMetrics,
      dailyRange: ranges.current,
      location: location.googleLocationId,
      period: "current",
    }),
    fetchImpl
  )
  if ("status" in current) {
    return current
  }

  const previous = await resolvePerformancePayload(
    options.adapters.gbpPerformance.fetchMultiDailyMetricsTimeSeries({
      accessToken: connection.accessToken,
      dailyMetrics: gbpPerformanceDailyMetrics,
      dailyRange: ranges.previous,
      location: location.googleLocationId,
      period: "previous",
    }),
    fetchImpl
  )
  if ("status" in previous) {
    return previous
  }

  return {
    locationName: location.locationName,
    metrics: summarizePerformanceMetrics(
      current,
      previous,
      datesInRange(ranges.current)
    ),
    range: {
      endDate: formatGbpPerformanceDate(ranges.current.endDate),
      previousEndDate: formatGbpPerformanceDate(ranges.previous.endDate),
      previousStartDate: formatGbpPerformanceDate(ranges.previous.startDate),
      startDate: formatGbpPerformanceDate(ranges.current.startDate),
    },
    refreshedAt: now.toISOString(),
    status: "READY",
  }
}
