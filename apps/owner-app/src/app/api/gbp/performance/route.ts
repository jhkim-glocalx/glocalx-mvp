import type { NextRequest } from "next/server"

import {
  getGbpPerformanceDashboard,
  getGbpPerformanceSummary,
  type GbpPerformanceDashboardResult,
  type GbpPerformanceMetric,
  type GbpPerformanceSummary,
} from "@/gbp/performance"
import { readDatabaseSession, withQueryableRouteDatabase } from "@/server/http"

const fallbackMetricKeys = [
  "impressions",
  "calls",
  "directions",
  "website",
] as const satisfies readonly Extract<
  GbpPerformanceDashboardResult,
  { readonly status: "READY" }
>["metrics"][number]["key"][]

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date)
  nextDate.setUTCDate(nextDate.getUTCDate() + days)
  return nextDate
}

function parseTrendPercent(trend: string): number {
  const match = /([+-]?\d+(?:\.\d+)?)%/.exec(trend)
  return match === null ? 0 : Number(match[1])
}

function buildFallbackRange(summary: GbpPerformanceSummary) {
  const endDate = new Date(summary.lastSyncedAt)
  const normalizedEndDate = Number.isNaN(endDate.getTime())
    ? new Date()
    : endDate
  const startDate = addDays(normalizedEndDate, 1 - summary.periodDays)
  const previousEndDate = addDays(startDate, -1)
  const previousStartDate = addDays(previousEndDate, 1 - summary.periodDays)

  return {
    endDate: formatDate(normalizedEndDate),
    previousEndDate: formatDate(previousEndDate),
    previousStartDate: formatDate(previousStartDate),
    startDate: formatDate(startDate),
  }
}

function toFallbackMetric(
  metric: GbpPerformanceMetric,
  index: number
): Extract<
  GbpPerformanceDashboardResult,
  { readonly status: "READY" }
>["metrics"][number] {
  const key = fallbackMetricKeys[index] ?? "website"
  const changePercent = parseTrendPercent(metric.trend)
  const previousTotal =
    changePercent === -100
      ? 0
      : Math.max(0, Math.round(metric.value / (1 + changePercent / 100)))

  return {
    changePercent,
    dailySeries: [],
    key,
    label: metric.label,
    previousTotal,
    total: metric.value,
  }
}

function summaryToDashboardResult(
  summary: GbpPerformanceSummary
): Extract<GbpPerformanceDashboardResult, { readonly status: "READY" }> {
  return {
    locationName: summary.storeName,
    metrics: summary.metrics.map(toFallbackMetric),
    range: buildFallbackRange(summary),
    refreshedAt: summary.lastSyncedAt,
    status: "READY",
  }
}

function canUseSummaryFallback(result: GbpPerformanceDashboardResult): boolean {
  return (
    result.status === "BLOCKED" &&
    (result.code === "AMBIGUOUS_GBP_LOCATION" ||
      result.code === "LOCATION_NOT_VERIFIED")
  )
}

async function handlePerformanceRequest(request: NextRequest) {
  return withQueryableRouteDatabase(
    async ({ adapters, gbpStore, sessionStore }) => {
      const session = await readDatabaseSession(request, sessionStore)
      if (session === undefined) {
        return Response.json(
          {
            message: "로그인이 필요합니다.",
            status: "UNAUTHENTICATED",
          },
          { status: 401 }
        )
      }

      const result = await getGbpPerformanceDashboard({
        adapters,
        gbpStore,
        storeId: session.storeId,
      })
      const responseResult = canUseSummaryFallback(result)
        ? summaryToDashboardResult(
            await getGbpPerformanceSummary({
              gbpStore,
              storeId: session.storeId,
            })
          )
        : result
      const status =
        responseResult.status === "READY"
          ? 200
          : responseResult.status === "BLOCKED"
            ? 409
            : 502
      return Response.json(responseResult, { status })
    }
  )
}

export async function GET(request: NextRequest) {
  return handlePerformanceRequest(request)
}

export async function POST(request: NextRequest) {
  return handlePerformanceRequest(request)
}
