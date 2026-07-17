import type {
  GbpPerformanceDailyRange,
  GbpPerformanceDate,
} from "@/integrations/contracts"

const koreaTimeZone = "Asia/Seoul"

const koreaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: koreaTimeZone,
  year: "numeric",
})

export type GbpPerformanceRanges = {
  readonly current: GbpPerformanceDailyRange
  readonly previous: GbpPerformanceDailyRange
}

function datePart(parts: Intl.DateTimeFormatPart[], type: string): number {
  const part = parts.find((item) => item.type === type)
  if (part === undefined) {
    throw new Error(`Missing formatted date part: ${type}`)
  }
  return Number(part.value)
}

function koreaDateFromInstant(date: Date): GbpPerformanceDate {
  const parts = koreaDateFormatter.formatToParts(date)
  return {
    day: datePart(parts, "day"),
    month: datePart(parts, "month"),
    year: datePart(parts, "year"),
  }
}

export function addCalendarDays(
  date: GbpPerformanceDate,
  days: number
): GbpPerformanceDate {
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

export function formatGbpPerformanceDate(date: GbpPerformanceDate): string {
  const year = String(date.year).padStart(4, "0")
  const month = String(date.month).padStart(2, "0")
  const day = String(date.day).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function datesInRange(
  range: GbpPerformanceDailyRange
): readonly string[] {
  const dates: string[] = []
  let currentDate = range.startDate
  while (compareDate(currentDate, range.endDate) <= 0) {
    dates.push(formatGbpPerformanceDate(currentDate))
    currentDate = addCalendarDays(currentDate, 1)
  }
  return dates
}

export function buildGbpPerformanceRanges(now: Date): GbpPerformanceRanges {
  const today = koreaDateFromInstant(now)
  const currentEndDate = addCalendarDays(today, -1)
  const currentStartDate = addCalendarDays(currentEndDate, -29)
  const previousEndDate = addCalendarDays(currentStartDate, -1)
  const previousStartDate = addCalendarDays(previousEndDate, -29)

  return {
    current: {
      endDate: currentEndDate,
      startDate: currentStartDate,
    },
    previous: {
      endDate: previousEndDate,
      startDate: previousStartDate,
    },
  }
}
