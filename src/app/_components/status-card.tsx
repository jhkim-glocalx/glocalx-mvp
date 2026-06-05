type StatusCardStatus = "neutral" | "success" | "warning"

type StatusCardProps = {
  readonly label: string
  readonly status?: StatusCardStatus
  readonly value: string
}

type MetricCardProps = {
  readonly label: string
  readonly value: string
}

export function StatusCard({
  label,
  status = "neutral",
  value,
}: StatusCardProps) {
  return (
    <article className="gx-status-card" data-status={status}>
      <span className="text-xs font-bold text-[var(--ink-soft)]">{label}</span>
      <strong className="text-base">{value}</strong>
    </article>
  )
}

export function MetricCard({ label, value }: MetricCardProps) {
  return (
    <article className="gx-metric-card">
      <span className="text-xs font-bold text-[var(--ink-soft)]">{label}</span>
      <strong className="text-lg">{value}</strong>
    </article>
  )
}
