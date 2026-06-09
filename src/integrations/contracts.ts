import type { AdapterBusinessProfileCandidate } from "@/domain/schemas"
import type { SqliteDatabase } from "@/server/db/sqlite"

export type IntegrationMode = "stub" | "production"

export type AdapterEnvironment = Readonly<Record<string, string | undefined>>

export type BlockedByCredentials = {
  readonly kind: "blocked_by_credentials"
  readonly code: "BLOCKED_BY_CREDENTIALS"
  readonly missingEnvVars: readonly string[]
}

export type AdapterOk<TValue> = {
  readonly kind: "ok"
  readonly value: TValue
}

export type AdapterResult<TValue> = AdapterOk<TValue> | BlockedByCredentials

export type ExternalFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response>

export type NaverSearchUnavailableReason =
  | "HTTP_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT"

export class NaverSearchUnavailableError extends Error {
  readonly name = "NaverSearchUnavailableError"

  constructor(
    readonly reason: NaverSearchUnavailableReason,
    readonly status: number | undefined = undefined
  ) {
    super(
      status === undefined
        ? `Naver local search unavailable: ${reason}`
        : `Naver local search unavailable: ${reason} ${status}`
    )
  }
}

export type HttpMethod = "GET" | "POST" | "PUT"

export type HttpRequestSpec = {
  readonly method: HttpMethod
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly requiredScopes?: readonly string[]
  readonly body?: unknown
}

export type NaverSearchInput = {
  readonly query: string
  readonly display: number
  readonly rawInput?: string
}

export type NaverSearchResult = {
  readonly candidates: readonly AdapterBusinessProfileCandidate[]
}

export type CreateLocationInput = {
  readonly accessToken: string
  readonly accountName: string
  readonly requestId: string
  readonly location: Readonly<Record<string, unknown>>
}

export type SearchGoogleLocationsInput = {
  readonly accessToken: string
  readonly location: Readonly<Record<string, unknown>>
}

export type GoogleLocationMatch = {
  readonly googleLocationId: string
  readonly requestAdminRightsUrl?: string
}

export type SearchGoogleLocationsResult = {
  readonly matches: readonly GoogleLocationMatch[]
}

export type RequestAdminRightsInput = {
  readonly accessToken: string
  readonly googleLocationId: string
  readonly requestAdminRightsUrl: string
}

export type CreateLocalPostInput = {
  readonly accessToken: string
  readonly parent: string
  readonly summary: string
}

export type ListReviewsInput = {
  readonly accessToken: string
  readonly parent: string
  readonly pageSize: number
  readonly pageToken?: string
}

export type UpdateReplyInput = {
  readonly accessToken: string
  readonly reviewName: string
  readonly comment: string
}

export const gbpPerformanceDailyMetrics = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "BUSINESS_DIRECTION_REQUESTS",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
] as const

export type GbpPerformanceDailyMetric =
  (typeof gbpPerformanceDailyMetrics)[number]

export type GbpPerformancePeriod = "current" | "previous"

export type GbpPerformanceDate = {
  readonly day: number
  readonly month: number
  readonly year: number
}

export type GbpPerformanceDailyRange = {
  readonly endDate: GbpPerformanceDate
  readonly startDate: GbpPerformanceDate
}

export type FetchGbpPerformanceInput = {
  readonly accessToken: string
  readonly dailyMetrics: readonly GbpPerformanceDailyMetric[]
  readonly dailyRange: GbpPerformanceDailyRange
  readonly location: string
  readonly period: GbpPerformancePeriod
}

export type GbpPerformanceDatedValue = {
  readonly date: GbpPerformanceDate
  readonly value?: string | undefined
}

export type GbpPerformanceDailyMetricTimeSeries = {
  readonly dailyMetric: GbpPerformanceDailyMetric
  readonly timeSeries: {
    readonly datedValues: readonly GbpPerformanceDatedValue[]
  }
}

export type GbpPerformanceApiResponse = {
  readonly multiDailyMetricTimeSeries: readonly {
    readonly dailyMetricTimeSeries: readonly GbpPerformanceDailyMetricTimeSeries[]
  }[]
}

export interface NaverSearchAdapter {
  searchLocal(
    input: NaverSearchInput
  ): Promise<AdapterResult<NaverSearchResult | HttpRequestSpec>>
}

export interface GoogleOAuthAdapter {
  connect(): AdapterResult<{ readonly subjectId: string }>
}

export interface GbpBusinessInformationAdapter {
  searchLocations(
    input: SearchGoogleLocationsInput
  ): Promise<AdapterResult<SearchGoogleLocationsResult | HttpRequestSpec>>
  requestAdminRights(
    input: RequestAdminRightsInput
  ): Promise<AdapterResult<HttpRequestSpec>>
  validateLocation(
    input: CreateLocationInput
  ): Promise<AdapterResult<HttpRequestSpec>>
  createLocation(
    input: CreateLocationInput
  ): Promise<AdapterResult<HttpRequestSpec>>
}

export interface GbpLocalPostsAdapter {
  createLocalPost(input: CreateLocalPostInput): AdapterResult<HttpRequestSpec>
}

export interface GbpReviewsAdapter {
  listReviews(input: ListReviewsInput): AdapterResult<HttpRequestSpec>
  updateReply(input: UpdateReplyInput): AdapterResult<HttpRequestSpec>
}

export interface GbpPerformanceAdapter {
  fetchMultiDailyMetricsTimeSeries(
    input: FetchGbpPerformanceInput
  ): AdapterResult<GbpPerformanceApiResponse | HttpRequestSpec>
}

export interface ContentGenerationAdapter {
  generatePostCopy(
    intent: string
  ): AdapterResult<{ readonly korean: string; readonly english: string }>
}

export interface TranslationAdapter {
  translate(
    text: string,
    targetLanguage: string
  ): AdapterResult<{ readonly text: string }>
}

export interface ClockAdapter {
  now(): Date
}

export interface JobSchedulerAdapter {
  schedule(jobType: string): AdapterResult<{ readonly jobId: string }>
}

export type IntegrationAdapters = {
  readonly mode: IntegrationMode
  readonly naverSearch: NaverSearchAdapter
  readonly googleOAuth: GoogleOAuthAdapter
  readonly gbpBusinessInformation: GbpBusinessInformationAdapter
  readonly gbpLocalPosts: GbpLocalPostsAdapter
  readonly gbpPerformance: GbpPerformanceAdapter
  readonly gbpReviews: GbpReviewsAdapter
  readonly contentGeneration: ContentGenerationAdapter
  readonly translation: TranslationAdapter
  readonly clock: ClockAdapter
  readonly jobScheduler: JobSchedulerAdapter
}

export type CreateIntegrationAdaptersOptions = {
  readonly env?: AdapterEnvironment
  readonly database?: SqliteDatabase
  readonly fetchImpl?: ExternalFetch
  readonly now?: Date
}
