import { isRecord, readString } from "@/app/_components/json-value"

export const appNavItems = [
  { id: "home", label: "홈" },
  { id: "post", label: "포스팅" },
  { id: "insights", label: "성과" },
] as const

export type AppNavId = (typeof appNavItems)[number]["id"]

export type DraftState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly draftId: string
      readonly kind: "ready"
      readonly koreanCopy: string
    }
  | { readonly kind: "error"; readonly message: string }

export type PublishState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "published"; readonly message: string }
  | { readonly kind: "blocked"; readonly message: string }

export type PerformanceMetric = {
  readonly caption: string
  readonly label: string
  readonly trend: string
  readonly value: number
}

export type PerformanceState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly followUps: readonly string[]
      readonly kind: "ready"
      readonly lastSyncedAt: string
      readonly locationStatus: string
      readonly metrics: readonly PerformanceMetric[]
      readonly periodDays: number
      readonly status: string
      readonly storeName: string
      readonly summary: string
    }
  | { readonly kind: "error"; readonly message: string }

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function parsePerformanceMetric(value: unknown): PerformanceMetric | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const label = readString(value["label"])
  const caption = readString(value["caption"])
  const trend = readString(value["trend"])
  const metricValue = readNumber(value["value"])
  if (
    label === undefined ||
    caption === undefined ||
    trend === undefined ||
    metricValue === undefined
  ) {
    return undefined
  }

  return {
    caption,
    label,
    trend,
    value: metricValue,
  }
}

function readMetricArray(value: unknown): readonly PerformanceMetric[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    const metric = parsePerformanceMetric(item)
    return metric === undefined ? [] : [metric]
  })
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item) => typeof item === "string")
}

export function isPerformanceNavId(navId: AppNavId): boolean {
  return navId === "home" || navId === "insights"
}

export function parseDraftState(payload: unknown): DraftState {
  if (!isRecord(payload)) {
    return { kind: "error", message: "초안 응답을 읽지 못했습니다." }
  }

  const preview = payload["preview"]
  if (!isRecord(preview)) {
    return { kind: "error", message: "초안 미리보기가 없습니다." }
  }

  return {
    draftId: readString(payload["draftId"]) ?? "draft-id-missing",
    kind: "ready",
    koreanCopy:
      readString(preview["koreanCopy"]) ?? "초안 문구를 다시 생성해주세요.",
  }
}

export function parseGbpPerformanceState(payload: unknown): PerformanceState {
  if (!isRecord(payload)) {
    return {
      kind: "error",
      message: "성과 응답을 읽지 못했습니다.",
    }
  }

  const metrics = readMetricArray(payload["metrics"])
  if (metrics.length === 0) {
    return {
      kind: "error",
      message: "성과 지표가 아직 준비되지 않았습니다.",
    }
  }

  return {
    followUps: readStringArray(payload["followUps"]),
    kind: "ready",
    lastSyncedAt:
      readString(payload["lastSyncedAt"]) ?? "동기화 시간이 없습니다.",
    locationStatus: readString(payload["locationStatus"]) ?? "UNKNOWN",
    metrics,
    periodDays: readNumber(payload["periodDays"]) ?? 30,
    status: readString(payload["status"]) ?? "READY",
    storeName: readString(payload["storeName"]) ?? "브런치모먼트 홍대점",
    summary:
      readString(payload["summary"]) ??
      "최근 Google Business Profile 성과를 확인합니다.",
  }
}

export function parsePublishState(payload: unknown): PublishState {
  if (!isRecord(payload)) {
    return { kind: "blocked", message: "게시 응답을 읽지 못했습니다." }
  }

  const status = readString(payload["status"])
  if (status === "PUBLISHED") {
    return { kind: "published", message: "게시 완료" }
  }

  return {
    kind: "blocked",
    message:
      readString(payload["message"]) ??
      "Google 비즈니스 프로필 상태를 확인해주세요.",
  }
}
