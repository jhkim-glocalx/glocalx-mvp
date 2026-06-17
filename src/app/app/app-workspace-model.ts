import {
  isRecord,
  readString,
  readStringArray,
} from "@/app/_components/json-value"

export {
  platformPreviewKey,
  parseDraftState,
  parsePostingDecisionTurnState,
} from "./app-workspace-draft-parser"
export type {
  DraftImagePreview,
  DraftIntentAnalysis,
  DraftState,
  DraftSuggestion,
  MarketingCaptionTranslation,
  MarketingImageAsset,
  MarketingLocale,
  MarketingPlatform,
  MarketingTranslationLocale,
  PlatformPostPreview,
  PostingChatTurn,
  PostingDecisionTurnState,
} from "./app-workspace-draft-parser"

export const appNavItems = [
  { id: "onboarding", label: "가게 인증 및 등록" },
  { id: "photo", label: "홍보 콘텐츠 넣기" },
  { id: "posting", label: "여러 SNS 자동홍보" },
  { id: "reviews", label: "리뷰 AI 관리" },
  { id: "targets", label: "홍보할 국가" },
  { id: "report", label: "주간 홍보 실적" },
  { id: "dashboard", label: "홍보 실적 자세히 보기" },
] as const

export type AppNavId = (typeof appNavItems)[number]["id"]

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

export function isPerformanceNavId(navId: AppNavId): boolean {
  return navId === "report" || navId === "dashboard"
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
