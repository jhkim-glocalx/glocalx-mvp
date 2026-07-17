import type {
  AdapterResult,
  FetchGbpPerformanceInput,
  GbpPerformanceAdapter,
  GbpPerformanceApiResponse,
  GbpPerformanceDailyMetric,
  GbpPerformanceDate,
} from "./contracts"

const currentTotals = {
  BUSINESS_DIRECTION_REQUESTS: 90,
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: 240,
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 300,
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: 360,
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: 300,
  CALL_CLICKS: 30,
  WEBSITE_CLICKS: 120,
} satisfies Record<GbpPerformanceDailyMetric, number>

const previousTotals = {
  BUSINESS_DIRECTION_REQUESTS: 60,
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: 210,
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 270,
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: 300,
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: 270,
  CALL_CLICKS: 30,
  WEBSITE_CLICKS: 90,
} satisfies Record<GbpPerformanceDailyMetric, number>

function addDays(date: GbpPerformanceDate, days: number): GbpPerformanceDate {
  const nextDate = new Date(
    Date.UTC(date.year, date.month - 1, date.day + days)
  )
  return {
    day: nextDate.getUTCDate(),
    month: nextDate.getUTCMonth() + 1,
    year: nextDate.getUTCFullYear(),
  }
}

function compareDate(
  left: GbpPerformanceDate,
  right: GbpPerformanceDate
): number {
  const leftTime = Date.UTC(left.year, left.month - 1, left.day)
  const rightTime = Date.UTC(right.year, right.month - 1, right.day)
  return leftTime - rightTime
}

function datesInRange(
  startDate: GbpPerformanceDate,
  endDate: GbpPerformanceDate
): readonly GbpPerformanceDate[] {
  const dates: GbpPerformanceDate[] = []
  let currentDate = startDate
  while (compareDate(currentDate, endDate) <= 0) {
    dates.push(currentDate)
    currentDate = addDays(currentDate, 1)
  }
  return dates
}

function valuesForTotal(dates: readonly GbpPerformanceDate[], total: number) {
  const baseValue = Math.floor(total / dates.length)
  const remainder = total % dates.length
  return dates.map((date, index) => ({
    date,
    value: String(baseValue + (index < remainder ? 1 : 0)),
  }))
}

export function createStubPerformance(): GbpPerformanceAdapter {
  return {
    fetchMultiDailyMetricsTimeSeries(
      input: FetchGbpPerformanceInput
    ): AdapterResult<GbpPerformanceApiResponse> {
      const dates = datesInRange(
        input.dailyRange.startDate,
        input.dailyRange.endDate
      )
      const totals = input.period === "current" ? currentTotals : previousTotals

      return {
        kind: "ok",
        value: {
          multiDailyMetricTimeSeries: [
            {
              dailyMetricTimeSeries: input.dailyMetrics.map((dailyMetric) => ({
                dailyMetric,
                timeSeries: {
                  datedValues: valuesForTotal(dates, totals[dailyMetric]),
                },
              })),
            },
          ],
        },
      }
    },
  }
}
