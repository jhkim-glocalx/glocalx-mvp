import { z } from "zod"

import {
  gbpPerformanceDailyMetrics,
  type GbpPerformanceApiResponse,
  type GbpPerformanceDailyMetric,
} from "@/integrations/contracts"

import { formatGbpPerformanceDate } from "./performance-dates"

export const performanceMetricDefinitions = [
  {
    dailyMetrics: [
      "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
      "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
      "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
      "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
    ],
    key: "impressions",
    label: "검색/지도 노출",
  },
  {
    dailyMetrics: ["BUSINESS_DIRECTION_REQUESTS"],
    key: "directions",
    label: "길찾기 요청",
  },
  {
    dailyMetrics: ["CALL_CLICKS"],
    key: "calls",
    label: "전화 클릭",
  },
  {
    dailyMetrics: ["WEBSITE_CLICKS"],
    key: "website",
    label: "웹사이트 클릭",
  },
] as const satisfies readonly {
  readonly dailyMetrics: readonly GbpPerformanceDailyMetric[]
  readonly key: string
  readonly label: string
}[]

export type PerformanceMetricKey =
  (typeof performanceMetricDefinitions)[number]["key"]

export type PerformanceMetricSummary = {
  readonly changePercent: number
  readonly dailySeries: readonly {
    readonly date: string
    readonly value: number
  }[]
  readonly key: PerformanceMetricKey
  readonly label: string
  readonly previousTotal: number
  readonly total: number
}

const dateSchema = z
  .object({
    day: z.number().int().min(1).max(31),
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(1),
  })
  .strict()

const datedValueSchema = z
  .object({
    date: dateSchema,
    value: z.string().regex(/^\d+$/).optional(),
  })
  .strict()

const performanceResponseSchema = z
  .object({
    multiDailyMetricTimeSeries: z.array(
      z
        .object({
          dailyMetricTimeSeries: z.array(
            z
              .object({
                dailyMetric: z.enum(gbpPerformanceDailyMetrics),
                timeSeries: z
                  .object({
                    datedValues: z.array(datedValueSchema),
                  })
                  .strict(),
              })
              .strict()
          ),
        })
        .strict()
    ),
  })
  .strict()

export function parseGbpPerformanceResponse(
  payload: unknown
): GbpPerformanceApiResponse | undefined {
  const parsed = performanceResponseSchema.safeParse(payload)
  if (!parsed.success) {
    return undefined
  }
  return parsed.data
}

function totalForMetrics(
  response: GbpPerformanceApiResponse,
  metrics: readonly GbpPerformanceDailyMetric[]
): number {
  return response.multiDailyMetricTimeSeries.reduce((total, group) => {
    const groupTotal = group.dailyMetricTimeSeries
      .filter((series) => metrics.includes(series.dailyMetric))
      .flatMap((series) => series.timeSeries.datedValues)
      .reduce((sum, point) => sum + Number(point.value ?? "0"), 0)
    return total + groupTotal
  }, 0)
}

function dailySeriesForMetrics(
  response: GbpPerformanceApiResponse,
  metrics: readonly GbpPerformanceDailyMetric[],
  dates: readonly string[]
) {
  const totalsByDate = new Map<string, number>()
  for (const group of response.multiDailyMetricTimeSeries) {
    for (const series of group.dailyMetricTimeSeries) {
      if (!metrics.includes(series.dailyMetric)) {
        continue
      }
      for (const point of series.timeSeries.datedValues) {
        const date = formatGbpPerformanceDate(point.date)
        totalsByDate.set(
          date,
          (totalsByDate.get(date) ?? 0) + Number(point.value ?? "0")
        )
      }
    }
  }
  return dates.map((date) => ({
    date,
    value: totalsByDate.get(date) ?? 0,
  }))
}

function percentChange(total: number, previousTotal: number): number {
  if (previousTotal === 0) {
    return total === 0 ? 0 : 100
  }
  return Math.round(((total - previousTotal) / previousTotal) * 1000) / 10
}

export function summarizePerformanceMetrics(
  current: GbpPerformanceApiResponse,
  previous: GbpPerformanceApiResponse,
  currentDates: readonly string[]
): readonly PerformanceMetricSummary[] {
  return performanceMetricDefinitions.map((definition) => {
    const total = totalForMetrics(current, definition.dailyMetrics)
    const previousTotal = totalForMetrics(previous, definition.dailyMetrics)
    return {
      changePercent: percentChange(total, previousTotal),
      dailySeries: dailySeriesForMetrics(
        current,
        definition.dailyMetrics,
        currentDates
      ),
      key: definition.key,
      label: definition.label,
      previousTotal,
      total,
    }
  })
}
