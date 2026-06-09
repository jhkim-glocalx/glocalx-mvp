import { describe, expect, it } from "vitest"

import {
  type AdapterResult,
  gbpPerformanceDailyMetrics,
  type GbpPerformanceApiResponse,
  type HttpRequestSpec,
} from "./contracts"
import { createIntegrationAdapters } from "./index"

const productionEnv = {
  APP_INTEGRATION_MODE: "production",
  GOOGLE_CLIENT_ID: "test-google-client",
  GOOGLE_CLIENT_SECRET: "test-google-secret",
} as const

function totalMetric(
  response: GbpPerformanceApiResponse,
  metricName: string
): number {
  return response.multiDailyMetricTimeSeries.reduce((total, group) => {
    const metricTotal = group.dailyMetricTimeSeries
      .filter((series) => series.dailyMetric === metricName)
      .flatMap((series) => series.timeSeries.datedValues)
      .reduce((sum, point) => sum + Number(point.value ?? "0"), 0)
    return total + metricTotal
  }, 0)
}

function expectPerformancePayload(
  result: AdapterResult<GbpPerformanceApiResponse | HttpRequestSpec>
): GbpPerformanceApiResponse {
  expect(result.kind).toBe("ok")
  if (result.kind !== "ok") {
    throw new Error("performance adapter should return ok")
  }
  if (!("multiDailyMetricTimeSeries" in result.value)) {
    throw new Error("performance adapter should return an API payload")
  }
  return result.value
}

describe("GBP performance adapters", () => {
  it("builds the exact Performance API request spec for multi-daily metrics", () => {
    // Given: production Google credentials and a full GBP location resource name.
    const adapters = createIntegrationAdapters({ env: productionEnv })

    // When: the performance adapter is asked for the current 30-day range.
    const result = adapters.gbpPerformance.fetchMultiDailyMetricsTimeSeries({
      accessToken: "test-access-token",
      dailyMetrics: gbpPerformanceDailyMetrics,
      dailyRange: {
        endDate: { day: 8, month: 6, year: 2026 },
        startDate: { day: 10, month: 5, year: 2026 },
      },
      location: "locations/456",
      period: "current",
    })

    // Then: it returns the documented request shape without executing it.
    expect(result).toEqual({
      kind: "ok",
      value: {
        headers: { Authorization: "Bearer test-access-token" },
        method: "GET",
        requiredScopes: ["https://www.googleapis.com/auth/business.manage"],
        url: "https://businessprofileperformance.googleapis.com/v1/locations/456:fetchMultiDailyMetricsTimeSeries?dailyMetrics=BUSINESS_IMPRESSIONS_DESKTOP_MAPS&dailyMetrics=BUSINESS_IMPRESSIONS_DESKTOP_SEARCH&dailyMetrics=BUSINESS_IMPRESSIONS_MOBILE_MAPS&dailyMetrics=BUSINESS_IMPRESSIONS_MOBILE_SEARCH&dailyMetrics=BUSINESS_DIRECTION_REQUESTS&dailyMetrics=CALL_CLICKS&dailyMetrics=WEBSITE_CLICKS&dailyRange.start_date.year=2026&dailyRange.start_date.month=5&dailyRange.start_date.day=10&dailyRange.end_date.year=2026&dailyRange.end_date.month=6&dailyRange.end_date.day=8",
      },
    })
  })

  it("returns deterministic stub totals for current and previous periods", () => {
    // Given: default stub adapters.
    const adapters = createIntegrationAdapters({ env: {} })

    // When: the performance adapter is asked for both comparison periods.
    const current = adapters.gbpPerformance.fetchMultiDailyMetricsTimeSeries({
      accessToken: "stub-access-token",
      dailyMetrics: gbpPerformanceDailyMetrics,
      dailyRange: {
        endDate: { day: 8, month: 6, year: 2026 },
        startDate: { day: 10, month: 5, year: 2026 },
      },
      location: "locations/demo",
      period: "current",
    })
    const previous = adapters.gbpPerformance.fetchMultiDailyMetricsTimeSeries({
      accessToken: "stub-access-token",
      dailyMetrics: gbpPerformanceDailyMetrics,
      dailyRange: {
        endDate: { day: 9, month: 5, year: 2026 },
        startDate: { day: 10, month: 4, year: 2026 },
      },
      location: "locations/demo",
      period: "previous",
    })

    // Then: each period contains the agreed demo totals.
    const currentPayload = expectPerformancePayload(current)
    const previousPayload = expectPerformancePayload(previous)
    expect(totalMetric(currentPayload, "WEBSITE_CLICKS")).toBe(120)
    expect(totalMetric(previousPayload, "WEBSITE_CLICKS")).toBe(90)
    expect(totalMetric(currentPayload, "BUSINESS_DIRECTION_REQUESTS")).toBe(90)
    expect(totalMetric(previousPayload, "BUSINESS_DIRECTION_REQUESTS")).toBe(60)
  })
})
