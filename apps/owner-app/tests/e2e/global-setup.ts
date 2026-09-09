import type { FullConfig } from "@playwright/test"

import { resetE2eDatabase } from "./db-harness"

export { resetE2eDatabase } from "./db-harness"

export default async function globalSetup(config: FullConfig): Promise<void> {
  await resetE2eDatabase()

  const baseUrl = config.projects[0]?.use.baseURL
  if (baseUrl !== undefined) {
    await warmRoutes(baseUrl)
  }
}

// Next dev compiles a route on its first request, and Playwright's webServer
// gate only waits for the app to answer one URL — so every other page and API
// route compiles inside whichever test reaches it first, against the default
// 30s per-test budget. Compiling here, before any test starts, keeps that cost
// out of every budget (the same fix #88 applied to the cross-app harness, which
// this suite never got). Best-effort: the server is already up, and a miss only
// restores the old in-test compile.
async function warmRoutes(baseUrl: string): Promise<void> {
  const warmupDraftId = "warmup"
  const warmupAssetId = "warmup"
  const warmupRequestId = "warmup"
  const paths = [
    "/",
    "/login",
    "/register",
    "/onboarding",
    "/app",
    "/api/auth/email/register",
    "/api/auth/email/login",
    "/api/onboarding/extractions",
    "/api/onboarding/store-profile/confirm",
    "/api/onboarding/conversation/slots",
    "/api/onboarding/complete",
    "/api/gbp/setup",
    "/api/gbp/access",
    "/api/gbp/adoption",
    "/api/gbp/category",
    "/api/gbp/verification",
    "/api/gbp/performance",
    "/api/posts/drafts",
    "/api/posts/conversation/decision",
    `/api/posts/${warmupDraftId}/publish`,
    `/api/posts/${warmupDraftId}/media/${warmupAssetId}`,
    "/api/campaigns/requests",
    "/api/chat/messages",
    "/api/chat/messages/read",
    "/api/activity/flush",
    "/api/instagram/oauth/start",
    ...["review", "assets", "upload-token"].map(
      (segment) => `/api/campaigns/requests/${warmupRequestId}/${segment}`
    ),
  ]

  // Unauthenticated GETs are enough: a redirect, a 401, or a 405 all run after
  // the route module has been compiled, which is the only thing being bought.
  // Capped concurrency: firing all of these at once trips Next dev's per-socket
  // listener limit and prints a MaxListenersExceededWarning into the CI log.
  const concurrency = 4
  for (let index = 0; index < paths.length; index += concurrency) {
    await Promise.all(
      paths.slice(index, index + concurrency).map(async (path) => {
        try {
          const response = await fetch(`${baseUrl}${path}`, {
            redirect: "manual",
          })
          await response.arrayBuffer()
        } catch {
          // Best-effort — see above.
        }
      })
    )
  }
}
