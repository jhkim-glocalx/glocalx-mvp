"use client"

import { useEffect, useState } from "react"

import { parseDashboardPayload } from "./performance-dashboard-parser"
import type {
  DashboardState,
  PerformanceDashboardVariant,
} from "./performance-dashboard-types"
import {
  DashboardHeader,
  ReadyDashboard,
  StatePanel,
} from "./performance-dashboard-view"

type PerformanceDashboardProps = {
  readonly variant: PerformanceDashboardVariant
}

export function PerformanceDashboard({ variant }: PerformanceDashboardProps) {
  const [state, setState] = useState<DashboardState>({ kind: "loading" })

  useEffect(() => {
    let isActive = true

    async function loadPerformance() {
      setState({ kind: "loading" })
      try {
        const response = await fetch("/api/gbp/performance", {
          headers: { Accept: "application/json" },
        })
        const payload: unknown = await response.json()
        if (isActive) {
          setState(parseDashboardPayload(payload))
        }
      } catch (caught) {
        if (isActive) {
          setState({
            kind: "error",
            message:
              caught instanceof Error
                ? caught.message
                : "성과 데이터를 가져오지 못했습니다.",
          })
        }
      }
    }

    void loadPerformance()

    return () => {
      isActive = false
    }
  }, [])

  return (
    <section className="grid min-h-full content-start gap-4">
      {state.kind === "ready" ? (
        <ReadyDashboard data={state.data} variant={variant} />
      ) : (
        <>
          <DashboardHeader variant={variant} />
          {state.kind === "loading" ? (
            <StatePanel
              message="최근 30일 Google Business Profile 성과를 불러오고 있습니다."
              title="GBP 성과를 불러오는 중"
              tone="muted"
            />
          ) : null}
          {state.kind === "blocked" ? (
            <StatePanel
              message={state.message}
              title="성과 조회 준비 필요"
              tone="warning"
            />
          ) : null}
          {state.kind === "error" ? (
            <StatePanel
              message={state.message}
              title="성과 조회 실패"
              tone="warning"
            />
          ) : null}
          {state.kind === "empty" ? (
            <StatePanel
              message={state.message}
              title="표시할 성과 없음"
              tone="muted"
            />
          ) : null}
        </>
      )}
    </section>
  )
}
