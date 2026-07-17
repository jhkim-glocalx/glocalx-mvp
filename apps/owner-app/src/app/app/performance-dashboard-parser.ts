import { isRecord, readString } from "@/app/_components/json-value"

import type {
  DashboardState,
  PerformanceMetric,
  PerformanceMetricKey,
  PerformancePoint,
  PerformanceRange,
} from "./performance-dashboard-types"

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function parseMetricKey(value: unknown): PerformanceMetricKey | undefined {
  if (
    value === "calls" ||
    value === "directions" ||
    value === "impressions" ||
    value === "website"
  ) {
    return value
  }
  return undefined
}

function parsePoint(value: unknown): PerformancePoint | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const date = readString(value["date"])
  const pointValue = readNumber(value["value"])
  if (date === undefined || pointValue === undefined) {
    return undefined
  }
  return { date, value: pointValue }
}

function isPerformancePoint(
  value: PerformancePoint | undefined
): value is PerformancePoint {
  return value !== undefined
}

function parsePointArray(value: unknown): readonly PerformancePoint[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map(parsePoint).filter(isPerformancePoint)
}

function parseMetric(value: unknown): PerformanceMetric | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const key = parseMetricKey(value["key"])
  const label = readString(value["label"])
  const total = readNumber(value["total"])
  const previousTotal = readNumber(value["previousTotal"])
  const changePercent = readNumber(value["changePercent"])
  if (
    key === undefined ||
    label === undefined ||
    total === undefined ||
    previousTotal === undefined ||
    changePercent === undefined
  ) {
    return undefined
  }

  return {
    changePercent,
    dailySeries: parsePointArray(value["dailySeries"]),
    key,
    label,
    previousTotal,
    total,
  }
}

function isPerformanceMetric(
  value: PerformanceMetric | undefined
): value is PerformanceMetric {
  return value !== undefined
}

function parseMetrics(
  value: unknown
): readonly PerformanceMetric[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  return value.map(parseMetric).filter(isPerformanceMetric)
}

function parseRange(value: unknown): PerformanceRange | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const endDate = readString(value["endDate"])
  const previousEndDate = readString(value["previousEndDate"])
  const previousStartDate = readString(value["previousStartDate"])
  const startDate = readString(value["startDate"])
  if (
    endDate === undefined ||
    previousEndDate === undefined ||
    previousStartDate === undefined ||
    startDate === undefined
  ) {
    return undefined
  }
  return { endDate, previousEndDate, previousStartDate, startDate }
}

export function parseDashboardPayload(payload: unknown): DashboardState {
  if (!isRecord(payload)) {
    return { kind: "error", message: "성과 응답을 읽지 못했습니다." }
  }

  const status = readString(payload["status"])
  if (status === "BLOCKED") {
    return {
      kind: "blocked",
      message:
        readString(payload["message"]) ?? "GBP 성과 조회를 준비해야 합니다.",
    }
  }
  if (status === "ERROR") {
    return {
      kind: "error",
      message:
        readString(payload["message"]) ?? "성과 데이터를 가져오지 못했습니다.",
    }
  }
  if (status !== "READY") {
    return { kind: "error", message: "성과 응답 상태를 읽지 못했습니다." }
  }

  const locationName = readString(payload["locationName"])
  const metrics = parseMetrics(payload["metrics"])
  const range = parseRange(payload["range"])
  const refreshedAt = readString(payload["refreshedAt"])
  if (
    locationName === undefined ||
    metrics === undefined ||
    range === undefined ||
    refreshedAt === undefined
  ) {
    return { kind: "error", message: "성과 응답 형식이 올바르지 않습니다." }
  }
  if (metrics.length === 0) {
    return { kind: "empty", message: "아직 표시할 GBP 성과가 없습니다." }
  }

  return {
    data: {
      locationName,
      metrics,
      range,
      refreshedAt,
      status: "READY",
    },
    kind: "ready",
  }
}
