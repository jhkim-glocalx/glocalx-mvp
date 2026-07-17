import type {
  PerformanceDashboardVariant,
  PerformanceMetric,
  PerformancePoint,
  ReadyPerformancePayload,
} from "./performance-dashboard-types"

type MetricCardProps = {
  readonly metric: PerformanceMetric
  readonly showSeries: boolean
}

type StatePanelProps = {
  readonly message: string
  readonly title: string
  readonly tone: "muted" | "warning"
}

type DashboardHeaderProps = {
  readonly data?: ReadyPerformancePayload
  readonly variant: PerformanceDashboardVariant
}

const dashboardTitles = {
  details: "GBP 성과 자세히",
  summary: "GBP 성과 요약",
} as const satisfies Record<PerformanceDashboardVariant, string>

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value)
}

function formatChange(value: number): string {
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(1)}%`
}

function formatRefreshedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "방금 전"
  }
  return new Intl.DateTimeFormat("ko-KR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(date)
}

export function StatePanel({ message, title, tone }: StatePanelProps) {
  const toneClass =
    tone === "warning"
      ? "border-[rgba(255,106,61,0.38)] bg-[var(--accent-soft)]"
      : "border-[var(--line)] bg-white"

  return (
    <div
      className={`grid gap-2 rounded-[18px] border p-4 text-[var(--ink)] ${toneClass}`}
      role="status"
    >
      <p className="text-xs font-black text-[var(--accent)]">{title}</p>
      <p className="text-sm font-bold leading-6 text-[var(--ink-soft)]">
        {message}
      </p>
    </div>
  )
}

export function DashboardHeader({ data, variant }: DashboardHeaderProps) {
  const subtitle =
    data === undefined
      ? "최근 30일 Google Business Profile 성과를 확인합니다."
      : `${data.locationName} · ${data.range.startDate} - ${data.range.endDate}`

  return (
    <div className="grid gap-2">
      <p className="text-xs font-black text-[var(--accent)]">
        Google Business Profile
      </p>
      <h1 className="text-xl font-black leading-7 text-[var(--ink)]">
        {dashboardTitles[variant]}
      </h1>
      <p className="text-sm font-bold leading-6 text-[var(--ink-soft)]">
        {subtitle}
      </p>
    </div>
  )
}

function MetricSeries({
  points,
}: {
  readonly points: readonly PerformancePoint[]
}) {
  const maxValue = Math.max(1, ...points.map((point) => point.value))

  return (
    <div
      aria-label="30일 일별 추이"
      className="grid h-12 grid-cols-[repeat(30,minmax(0,1fr))] items-end gap-0.5"
    >
      {points.map((point) => (
        <span
          aria-label={`${point.date} ${point.value}`}
          className="min-h-1 rounded-t-sm bg-[var(--accent)]"
          key={point.date}
          style={{ height: `${Math.max(4, (point.value / maxValue) * 48)}px` }}
        />
      ))}
    </div>
  )
}

function MetricCard({ metric, showSeries }: MetricCardProps) {
  const changeTone =
    metric.changePercent > 0
      ? "text-[var(--mint)]"
      : metric.changePercent < 0
        ? "text-[var(--accent-press)]"
        : "text-[var(--muted)]"

  return (
    <article className="gx-metric-card gx-rise min-w-0 gap-2">
      <span className="truncate">{metric.label}</span>
      <strong className="text-2xl tabular-nums leading-7">
        {formatNumber(metric.total)}
      </strong>
      <p className={`text-xs font-black ${changeTone}`}>
        이전 30일 대비 {formatChange(metric.changePercent)}
      </p>
      {showSeries ? (
        <div className="grid gap-2 pt-2">
          <MetricSeries points={metric.dailySeries} />
          <p className="text-[11px] font-bold text-[var(--muted)]">
            이전 기간 {formatNumber(metric.previousTotal)}
          </p>
        </div>
      ) : null}
    </article>
  )
}

export function ReadyDashboard({
  data,
  variant,
}: {
  readonly data: ReadyPerformancePayload
  readonly variant: PerformanceDashboardVariant
}) {
  const showSeries = variant === "details"

  return (
    <>
      <DashboardHeader data={data} variant={variant} />

      <div className="gx-metric-grid">
        {data.metrics.map((metric) => (
          <MetricCard
            key={metric.key}
            metric={metric}
            showSeries={showSeries}
          />
        ))}
      </div>

      {showSeries ? (
        <section className="grid gap-3 rounded-[18px] border border-[var(--line)] bg-white p-4 text-[var(--ink)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-black leading-6">비교 기간</h2>
              <p className="text-xs font-bold leading-5 text-[var(--muted)]">
                {data.range.previousStartDate} - {data.range.previousEndDate}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-[var(--mint-soft)] px-2.5 py-1 text-[11px] font-black text-[var(--ink)]">
              30일
            </span>
          </div>
          <p className="text-sm font-bold leading-6 text-[var(--ink-soft)]">
            노출, 길찾기, 전화, 웹사이트 클릭만 합산했습니다.
          </p>
        </section>
      ) : null}

      <p className="text-[11px] font-bold leading-5 text-[var(--muted)]">
        갱신 {formatRefreshedAt(data.refreshedAt)}
      </p>
    </>
  )
}
