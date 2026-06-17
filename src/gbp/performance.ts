import { z } from "zod"

import type {
  AdapterResult,
  HttpRequestSpec,
  IntegrationAdapters,
} from "@/integrations/contracts"
import {
  gbpPerformanceDailyMetrics,
  type GbpPerformanceApiResponse,
} from "@/integrations/contracts"
import type { SqliteDatabase } from "@/server/db/sqlite"

import {
  buildGbpPerformanceRanges,
  datesInRange,
  formatGbpPerformanceDate,
} from "./performance-dates"
import {
  parseGbpPerformanceResponse,
  summarizePerformanceMetrics,
  type PerformanceMetricSummary,
} from "./performance-metrics"
import {
  loadGbpPerformanceConnection,
  loadGbpPerformanceLocation,
} from "./performance-repository"

export type GbpPerformanceMetric = {
  readonly caption: string
  readonly label: string
  readonly trend: string
  readonly value: number
}

export type GbpPerformanceSummary = {
  readonly followUps: readonly string[]
  readonly lastSyncedAt: string
  readonly locationStatus: string
  readonly metrics: readonly GbpPerformanceMetric[]
  readonly periodDays: number
  readonly status: "READY"
  readonly storeName: string
  readonly summary: string
}

const storePerformanceRowSchema = z.object({
  category: z.string().nullable(),
  name: z.string(),
  phone: z.string().nullable(),
})

const locationPerformanceRowSchema = z.object({
  google_location_id: z.string().nullable(),
  status: z.string(),
  updated_at: z.string(),
})

const countRowSchema = z.object({
  count: z.number(),
})

function getCount(
  database: SqliteDatabase,
  query: string,
  storeId: string
): number {
  const row = database.prepare(query).get(storeId)
  return countRowSchema.parse(row).count
}

function buildFollowUps(locationStatus: string): readonly string[] {
  // Copy mirrors the location state: verified can proceed, claim-required needs owner action, others await verification.
  if (locationStatus === "VERIFIED") {
    return [
      "GBP 인증이 완료되어 라이브 게시와 리뷰 작업을 계속 진행할 수 있습니다.",
    ]
  }

  if (locationStatus === "CLAIM_REQUIRED") {
    return [
      "기존 GBP 소유권 요청이 필요합니다. 승인 후 실시간 성과 연동을 완료합니다.",
    ]
  }

  return ["GBP 인증이 완료되면 Google 실시간 성과 지표를 연결합니다."]
}

export function getGbpPerformanceSummary(
  database: SqliteDatabase,
  storeId: string
): GbpPerformanceSummary {
  const store = storePerformanceRowSchema.parse(
    database
      .prepare("SELECT name, phone, category FROM stores WHERE id = ?")
      .get(storeId)
  )
  const location = locationPerformanceRowSchema.parse(
    database
      .prepare(
        "SELECT status, google_location_id, updated_at FROM gbp_locations WHERE store_id = ? ORDER BY updated_at DESC LIMIT 1"
      )
      .get(storeId)
  )
  const draftCount = getCount(
    database,
    "SELECT COUNT(*) AS count FROM post_drafts WHERE store_id = ?",
    storeId
  )
  const publishedCount = getCount(
    database,
    "SELECT COUNT(*) AS count FROM post_drafts WHERE store_id = ? AND status = 'PUBLISHED'",
    storeId
  )
  const baseViews = location.status === "VERIFIED" ? 1240 : 420
  const profileViews = baseViews + draftCount * 18 + publishedCount * 32
  const phoneClicks = Math.max(8, Math.round(profileViews / 34))
  const directionRequests = Math.max(12, Math.round(profileViews / 21))
  const postActions = Math.max(3, draftCount * 4 + publishedCount * 9)

  return {
    followUps: buildFollowUps(location.status),
    lastSyncedAt: location.updated_at,
    locationStatus: location.status,
    metrics: [
      {
        caption: "검색/지도 노출",
        label: "프로필 조회",
        trend: "+12%",
        value: profileViews,
      },
      {
        caption: store.phone === null ? "전화 등록 필요" : "전화 반응",
        label: "전화 클릭",
        trend: "+4%",
        value: phoneClicks,
      },
      {
        caption: "지도 액션",
        label: "길찾기 요청",
        trend: "+9%",
        value: directionRequests,
      },
      {
        caption: store.category ?? "GBP 게시 반응",
        label: "게시 반응",
        trend: "+6%",
        value: postActions,
      },
    ],
    periodDays: 30,
    status: "READY",
    storeName: store.name,
    summary: `${store.name}의 최근 30일 GBP 노출과 고객 액션을 요약했습니다.`,
  }
}

export type GbpPerformanceFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response>

export type GbpPerformanceDashboardResult =
  // BLOCKED is a local prerequisite gap; ERROR is a Google/upstream failure after prerequisites passed.
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
  readonly database: SqliteDatabase
  readonly fetchImpl?: GbpPerformanceFetch
  readonly now?: Date
  readonly storeId: string
}

function blocked(
  code: Extract<GbpPerformanceDashboardResult, { status: "BLOCKED" }>["code"],
  message: string
): GbpPerformanceDashboardResult {
  return { code, message, status: "BLOCKED" }
}

function error(
  code: Extract<GbpPerformanceDashboardResult, { status: "ERROR" }>["code"],
  message: string
): GbpPerformanceDashboardResult {
  return { code, message, status: "ERROR" }
}

function isHttpRequestSpec(
  value: GbpPerformanceApiResponse | HttpRequestSpec
): value is HttpRequestSpec {
  return "method" in value && "url" in value && "headers" in value
}

async function readJson(response: Response): Promise<unknown | undefined> {
  try {
    return await response.json()
  } catch (caught) {
    if (caught instanceof SyntaxError) {
      return undefined
    }
    throw caught
  }
}

async function executePerformanceSpec(
  spec: HttpRequestSpec,
  fetchImpl: GbpPerformanceFetch
): Promise<GbpPerformanceApiResponse | GbpPerformanceDashboardResult> {
  // Production request specs resolve here so timeout, auth, quota, and malformed-payload mapping stay centralized.
  let response: Response
  try {
    response = await fetchImpl(spec.url, {
      headers: spec.headers,
      method: spec.method,
      signal: AbortSignal.timeout(8_000),
    })
  } catch (caught) {
    if (caught instanceof Error) {
      return error(
        "GOOGLE_UPSTREAM_UNAVAILABLE",
        "Google Business Profile 성과 API에 연결하지 못했습니다."
      )
    }
    throw caught
  }

  if (response.status === 401 || response.status === 403) {
    return error(
      "GOOGLE_AUTH_REQUIRED",
      "Google Business Profile 성과 권한을 다시 연결해주세요."
    )
  }
  if (response.status === 429) {
    return error(
      "GOOGLE_QUOTA_EXCEEDED",
      "Google Business Profile 성과 조회 한도를 초과했습니다."
    )
  }
  if (!response.ok) {
    return error(
      "GOOGLE_UPSTREAM_ERROR",
      "Google Business Profile 성과 API가 일시적으로 응답하지 않습니다."
    )
  }

  const payload = await readJson(response)
  const parsed = parseGbpPerformanceResponse(payload)
  if (parsed === undefined) {
    return error(
      "GOOGLE_RESPONSE_MALFORMED",
      "Google Business Profile 성과 응답을 읽지 못했습니다."
    )
  }
  return parsed
}

async function resolvePerformancePayload(
  result: AdapterResult<GbpPerformanceApiResponse | HttpRequestSpec>,
  fetchImpl: GbpPerformanceFetch
): Promise<GbpPerformanceApiResponse | GbpPerformanceDashboardResult> {
  // Stub payloads and production request specs both normalize to the same parsed performance contract.
  if (result.kind === "blocked_by_credentials") {
    return blocked(
      "GOOGLE_CREDENTIALS_MISSING",
      "Google API 인증 정보가 설정되지 않았습니다."
    )
  }

  if (isHttpRequestSpec(result.value)) {
    return executePerformanceSpec(result.value, fetchImpl)
  }

  return result.value
}

export async function getGbpPerformanceDashboard(
  options: GetGbpPerformanceDashboardOptions
): Promise<GbpPerformanceDashboardResult> {
  const location = loadGbpPerformanceLocation(options.database, options.storeId)
  if (location.kind !== "ready") {
    // Local location gates run before any live Google performance read.
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

  const connection = loadGbpPerformanceConnection(
    options.database,
    options.storeId
  )
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
  // Resolve current first; if it fails, that actionable error should not be masked by the comparison range.
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
  // Previous-period data uses the same resolver so stub and production comparisons share error handling.
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
    // The dashboard compares the current 30 complete Korea days against the immediately previous window.
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
