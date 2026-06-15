import type { AdapterResult, HttpRequestSpec } from "./contracts"

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
