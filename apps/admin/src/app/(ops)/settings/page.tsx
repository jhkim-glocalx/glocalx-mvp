import { openDatabaseContext } from "@glocalx/db"
import { createDatabaseSupportMetricsStore } from "@glocalx/db/support/metrics-store"
import {
  createDatabaseOrgCredentialStore,
  type OrgCredentialSummary,
} from "@glocalx/db/support/org-credential-store"
import {
  computeWeeklyKillMetrics,
  lastSevenDayWindow,
  type WeeklyKillMetrics,
} from "@glocalx/domain/support/metrics"

import { OrgCredentialsPanel } from "./org-credentials-panel"
import { OrphanedUploadsPanel } from "./orphaned-uploads-panel"

// Premise-2 instrumentation surfaced read-only (design-decisions.md §Premises/2).
// The db store gathers the window's rows; the pure domain function computes —
// this page only composes and renders. Median response time is the metric with
// a kill threshold (compared against the Kakao baseline at week 4); activation
// and owner-initiated count are context-only.
async function loadSettings(): Promise<{
  readonly metrics: WeeklyKillMetrics
  readonly credentials: readonly OrgCredentialSummary[]
}> {
  const window = lastSevenDayWindow(new Date())
  const databaseContext = await openDatabaseContext()
  try {
    const input = await createDatabaseSupportMetricsStore(
      databaseContext.queryable
    ).gatherWeeklyMetricsInput(window)
    // Summaries only — this page never loads token material, even server-side.
    const credentials = await createDatabaseOrgCredentialStore(
      databaseContext.queryable
    ).listOrgCredentialSummaries()
    return { metrics: computeWeeklyKillMetrics(input), credentials }
  } finally {
    await databaseContext.close()
  }
}

function formatResponseTime(milliseconds: number | null): string {
  if (milliseconds === null) {
    return "—"
  }
  const totalSeconds = Math.round(milliseconds / 1000)
  if (totalSeconds < 60) {
    return `${totalSeconds}초`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds === 0 ? `${minutes}분` : `${minutes}분 ${seconds}초`
}

export default async function SettingsPage() {
  const { metrics, credentials } = await loadSettings()

  return (
    <>
      <h1 className="ops-page-title">설정</h1>

      <section className="ops-metrics" aria-label="주간 채팅 지표">
        <h2 className="ops-section-title">채팅 킬 지표 — 최근 7일</h2>
        <div className="ops-metric-grid">
          <div className="ops-metric-card">
            <span className="ops-metric-value" data-testid="metric-response">
              {formatResponseTime(metrics.medianOwnerResponseTimeMs)}
            </span>
            <span className="ops-metric-label">사장님 응답 시간 중앙값</span>
            <span className="ops-metric-note">카카오 대비 킬 임계값</span>
          </div>
          <div className="ops-metric-card">
            <span className="ops-metric-value">{metrics.activation}</span>
            <span className="ops-metric-label">주간 활성화 매장 수</span>
            <span className="ops-metric-note">참고 지표</span>
          </div>
          <div className="ops-metric-card">
            <span className="ops-metric-value">
              {metrics.ownerInitiatedConversationCount}
            </span>
            <span className="ops-metric-label">사장님이 먼저 시작한 대화</span>
            <span className="ops-metric-note">참고 지표</span>
          </div>
        </div>
      </section>

      <OrgCredentialsPanel initialCredentials={credentials} />

      <OrphanedUploadsPanel />

      <div className="ops-empty">
        <strong>추가 설정 예정</strong>
        <p>운영자 계정은 Phase 3부터 이곳에서 관리됩니다.</p>
      </div>
    </>
  )
}
