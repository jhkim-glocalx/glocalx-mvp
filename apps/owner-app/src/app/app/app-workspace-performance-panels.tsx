"use client"

import { ActionChip } from "@/app/_components/action-chip"

import type { PerformanceMetric, PerformanceState } from "./app-workspace-model"

type PerformancePanelsProps = {
  readonly onRefresh: () => void
  readonly state: PerformanceState
}

function formatMetricValue(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value)
}

function MetricTile({ metric }: { readonly metric: PerformanceMetric }) {
  return (
    <article className="grid min-h-28 content-between rounded-[18px] border border-[var(--line)] bg-white p-4 text-[var(--ink)] shadow-[0_16px_38px_-34px_rgba(25,23,32,0.8)]">
      <div className="grid gap-1">
        <p className="text-xs font-black text-[var(--muted)]">{metric.label}</p>
        <strong className="text-2xl font-black leading-none">
          {formatMetricValue(metric.value)}
        </strong>
      </div>
      <div className="flex items-end justify-between gap-2 text-[11px] font-black">
        <span className="min-w-0 text-[var(--muted)]">{metric.caption}</span>
        <span className="shrink-0 rounded-full bg-[var(--mint-soft)] px-2 py-0.5 text-[var(--ink)]">
          {metric.trend}
        </span>
      </div>
    </article>
  )
}

function LoadingPerformance() {
  return (
    <div
      className="inline-flex w-fit items-center gap-3 rounded-[18px] bg-white px-4 py-3 text-sm font-bold text-[var(--muted)]"
      role="status"
    >
      <span>성과를 불러오는 중</span>
      <span aria-hidden="true" className="inline-flex items-center gap-1">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:120ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:240ms]" />
      </span>
    </div>
  )
}

function EmptyPerformance({ onRefresh }: { readonly onRefresh: () => void }) {
  return (
    <div className="grid gap-3 rounded-[20px] border border-[var(--line)] bg-white p-4">
      <p className="text-sm font-bold leading-6 text-[var(--ink-soft)]">
        Google Business Profile 성과를 아직 불러오지 않았습니다.
      </p>
      <div className="w-36">
        <ActionChip label="성과 불러오기" onClick={onRefresh} />
      </div>
    </div>
  )
}

function ErrorPerformance({
  message,
  onRefresh,
}: {
  readonly message: string
  readonly onRefresh: () => void
}) {
  return (
    <div
      className="grid gap-3 rounded-[20px] border border-[rgba(255,106,61,0.38)] bg-[var(--accent-soft)] p-4 text-[var(--ink)]"
      role="status"
    >
      <div className="grid gap-1">
        <p className="text-xs font-black text-[var(--accent)]">
          성과 조회 확인 필요
        </p>
        <p className="text-sm font-bold leading-6">{message}</p>
      </div>
      <div className="w-36">
        <ActionChip label="다시 조회" onClick={onRefresh} tone="ghost" />
      </div>
    </div>
  )
}

function ReadyPerformance({
  state,
}: {
  readonly state: Extract<PerformanceState, { readonly kind: "ready" }>
}) {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2">
        {state.metrics.map((metric) => (
          <MetricTile key={metric.label} metric={metric} />
        ))}
      </div>
      <div className="grid gap-2 rounded-[18px] border border-[var(--line)] bg-[var(--phone-bg)] p-4 text-sm font-bold leading-6 text-[var(--ink-soft)]">
        <p>{state.summary}</p>
        <p className="text-xs font-black text-[var(--muted)]">
          상태 {state.locationStatus} · {state.periodDays}일 기준
        </p>
      </div>
      {state.followUps.length > 0 ? (
        <div className="grid gap-2 text-xs font-black leading-5 text-[var(--muted)]">
          {state.followUps.map((followUp) => (
            <p key={followUp}>{followUp}</p>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function PerformanceContent({ onRefresh, state }: PerformancePanelsProps) {
  if (state.kind === "loading") {
    return <LoadingPerformance />
  }

  if (state.kind === "error") {
    return <ErrorPerformance message={state.message} onRefresh={onRefresh} />
  }

  if (state.kind === "ready") {
    return <ReadyPerformance state={state} />
  }

  return <EmptyPerformance onRefresh={onRefresh} />
}

export function HomePanel({ onRefresh, state }: PerformancePanelsProps) {
  return (
    <section className="flex min-h-full flex-col gap-5">
      <div className="grid gap-2">
        <p className="text-xs font-black text-[var(--accent)]">
          Google Business Profile
        </p>
        <h1 className="text-xl font-black leading-7 text-[var(--ink)]">
          GBP 성과 요약
        </h1>
        <p className="text-sm font-bold leading-6 text-[var(--ink-soft)]">
          최근 30일 Google Business Profile 성과를 확인합니다.
        </p>
      </div>
      <PerformanceContent onRefresh={onRefresh} state={state} />
    </section>
  )
}

export function InsightsPanel({ onRefresh, state }: PerformancePanelsProps) {
  return (
    <section className="flex min-h-full flex-col gap-5">
      <div className="grid gap-2">
        <p className="text-xs font-black text-[var(--accent)]">
          Google Business Profile
        </p>
        <h1 className="text-xl font-black leading-7 text-[var(--ink)]">
          GBP 성과 자세히
        </h1>
        <p className="text-sm font-bold leading-6 text-[var(--ink-soft)]">
          검색, 전화, 길찾기 반응을 한 화면에서 봅니다.
        </p>
      </div>
      <PerformanceContent onRefresh={onRefresh} state={state} />
    </section>
  )
}
