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
    <article className="gx-status-card gx-rise" data-status={status}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

export function MetricCard({ label, value }: MetricCardProps) {
  return (
    <article className="gx-metric-card gx-rise">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}
