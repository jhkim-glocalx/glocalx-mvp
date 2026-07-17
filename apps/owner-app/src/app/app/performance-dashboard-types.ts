export type PerformanceDashboardVariant = "details" | "summary"

export type PerformanceMetricKey =
  | "calls"
  | "directions"
  | "impressions"
  | "website"

export type PerformancePoint = {
  readonly date: string
  readonly value: number
}

export type PerformanceMetric = {
  readonly changePercent: number
  readonly dailySeries: readonly PerformancePoint[]
  readonly key: PerformanceMetricKey
  readonly label: string
  readonly previousTotal: number
  readonly total: number
}

export type PerformanceRange = {
  readonly endDate: string
  readonly previousEndDate: string
  readonly previousStartDate: string
  readonly startDate: string
}

export type ReadyPerformancePayload = {
  readonly locationName: string
  readonly metrics: readonly PerformanceMetric[]
  readonly range: PerformanceRange
  readonly refreshedAt: string
  readonly status: "READY"
}

export type DashboardState =
  | { readonly kind: "blocked"; readonly message: string }
  | { readonly kind: "empty"; readonly message: string }
  | { readonly kind: "error"; readonly message: string }
  | { readonly data: ReadyPerformancePayload; readonly kind: "ready" }
  | { readonly kind: "loading" }
