import { randomUUID } from "node:crypto"

import { resetAndSeedDatabaseForProvider } from "@glocalx/db/reset-seed"
import { applyMigrations, openDatabase } from "@glocalx/db/sqlite"
import { hashPassword } from "@glocalx/domain/password-hash"

import {
  adminBaseUrl,
  crossDatabasePath,
  e2eAdminEmail,
  e2eAdminPassword,
  ownerBaseUrl,
} from "./harness"

export default async function globalSetup(): Promise<void> {
  const env = {
    ...process.env,
    DATABASE_PROVIDER: "sqlite",
    GLOCALX_DB_PATH: crossDatabasePath,
  }
  await resetAndSeedDatabaseForProvider(env)

  // The admin app has no registration route, so the cross-app specs need a
  // seeded operator account.
  const database = openDatabase(crossDatabasePath)
  try {
    applyMigrations(database)
    const now = new Date().toISOString()
    database
      .prepare(
        "INSERT INTO admin_users (id, email, password_hash, display_name, role, status, created_at) VALUES (?, ?, ?, ?, 'OPERATOR', 'ACTIVE', ?)"
      )
      .run(
        randomUUID(),
        e2eAdminEmail,
        await hashPassword(e2eAdminPassword),
        "E2E Operator",
        now
      )

    // The demo store has completed GBP connect, so it has a not_requested org
    // access request the operator drives to granted in the gbp-access spec.
    database
      .prepare(
        "INSERT INTO gbp_access_requests (id, store_id, gbp_location_ref, state, note, requested_at, granted_at, created_at, updated_at) VALUES (?, 'demo-store', 'locations/demo-brunch', 'not_requested', NULL, ?, NULL, ?, ?)"
      )
      .run(randomUUID(), now, now, now)
  } finally {
    database.close()
  }

  await warmRoutes()
}

// Next dev compiles a route on its first request, and Playwright's webServer
// gate only waits for the app to answer one URL — so every other page and API
// route compiles inside whichever test reaches it first. That cost lands almost
// entirely on the alphabetically-first spec (ai-mode-handoff), which then runs
// against the default 30s per-test budget with no headroom on a CI runner.
// Compiling here, before any test starts, keeps the cost out of every budget.
// Best-effort: the servers are already up, and a miss only restores the old
// in-test compile.
async function warmRoutes(): Promise<void> {
  const warmupConversationId = "warmup"
  const warmupRequestId = "warmup"
  const urls = [
    `${ownerBaseUrl}/app`,
    `${ownerBaseUrl}/onboarding`,
    `${ownerBaseUrl}/api/chat/messages`,
    `${ownerBaseUrl}/api/chat/messages/read`,
    `${adminBaseUrl}/login`,
    `${adminBaseUrl}/stores`,
    `${adminBaseUrl}/inbox`,
    `${adminBaseUrl}/api/auth/login`,
    `${adminBaseUrl}/api/inbox/conversations`,
    `${adminBaseUrl}/queue`,
    `${adminBaseUrl}/settings`,
    `${adminBaseUrl}/api/settings/org-credentials`,
    `${adminBaseUrl}/api/stores/access-requests`,
    `${adminBaseUrl}/api/queue/requests`,
    `${ownerBaseUrl}/api/campaigns/requests`,
    `${ownerBaseUrl}/api/gbp/access`,
    ...[
      "review",
      "assets",
      "upload-token",
      "production",
      "final-copy",
      "call-to-action",
      "publish",
      "nudge",
    ].map(
      (segment) =>
        `${adminBaseUrl}/api/queue/requests/${warmupRequestId}/${segment}`
    ),
    ...["review", "assets", "upload-token"].map(
      (segment) =>
        `${ownerBaseUrl}/api/campaigns/requests/${warmupRequestId}/${segment}`
    ),
    ...[
      "messages",
      "mode",
      "reply",
      "assign",
      "resolve",
      "draft/send",
      "draft/discard",
    ].map(
      (segment) =>
        `${adminBaseUrl}/api/inbox/conversations/${warmupConversationId}/${segment}`
    ),
  ]
  // Unauthenticated GETs are enough: a redirect, a 401, or a 405 all run after
  // the route module has been compiled, which is the only thing being bought.
  // Capped concurrency: firing all of these at once trips Next dev's per-socket
  // listener limit and prints a MaxListenersExceededWarning into the CI log.
  const concurrency = 4
  for (let index = 0; index < urls.length; index += concurrency) {
    await Promise.all(
      urls.slice(index, index + concurrency).map(async (url) => {
        try {
          const response = await fetch(url, { redirect: "manual" })
          await response.arrayBuffer()
        } catch {
          // Best-effort — see above.
        }
      })
    )
  }
}
