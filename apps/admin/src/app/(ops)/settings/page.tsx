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
    return `${totalSeconds}s`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`
}

export default async function SettingsPage() {
  const { metrics, credentials } = await loadSettings()

  return (
    <>
      <h1 className="ops-page-title">Settings</h1>

      <section className="ops-metrics" aria-label="Weekly chat metrics">
        <h2 className="ops-section-title">Chat kill metrics — last 7 days</h2>
        <div className="ops-metric-grid">
          <div className="ops-metric-card">
            <span className="ops-metric-value" data-testid="metric-response">
              {formatResponseTime(metrics.medianOwnerResponseTimeMs)}
            </span>
            <span className="ops-metric-label">Median owner response time</span>
            <span className="ops-metric-note">kill threshold vs. Kakao</span>
          </div>
          <div className="ops-metric-card">
            <span className="ops-metric-value">{metrics.activation}</span>
            <span className="ops-metric-label">Weekly activation (stores)</span>
            <span className="ops-metric-note">context signal</span>
          </div>
          <div className="ops-metric-card">
            <span className="ops-metric-value">
              {metrics.ownerInitiatedConversationCount}
            </span>
            <span className="ops-metric-label">
              Owner-initiated conversations
            </span>
            <span className="ops-metric-note">context signal</span>
          </div>
        </div>
      </section>

      <OrgCredentialsPanel initialCredentials={credentials} />

      <div className="ops-empty">
        <strong>More configuration coming</strong>
        <p>Operator accounts are managed here from Phase 3 onward.</p>
      </div>
    </>
  )
}
