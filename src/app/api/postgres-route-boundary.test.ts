import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const userVisibleRuntimeFiles = [
  "src/auth/server-session.ts",
  "src/server/http/index.ts",
  "src/app/diagnostics/integrations/page.tsx",
  "src/app/api/admin/integrations/route.ts",
  "src/app/api/auth/demo-login/route.ts",
  "src/app/api/auth/google/start/route.ts",
  "src/app/api/auth/kakao/start/route.ts",
  "src/app/api/onboarding/conversation/slots/route.ts",
  "src/app/api/posts/drafts/route.ts",
  "src/app/api/posts/[draftId]/publish/route.ts",
  "src/app/api/posts/conversation/decision/route.ts",
] as const

const sqliteBypassPatterns = [
  `ensure${"DemoOwnerStore"}`,
  `get${"StoredSessionFromCookieValues"}`,
  `complete${"StoredSessionOnboarding"}`,
  `read${"DemoSession"}(`,
] as const

describe("Postgres route database boundary", () => {
  it("keeps user-visible session paths out of legacy SQLite helpers", () => {
    for (const filePath of userVisibleRuntimeFiles) {
      const source = readFileSync(filePath, "utf8")

      for (const pattern of sqliteBypassPatterns) {
        expect(source, `${filePath} must not contain ${pattern}`).not.toContain(
          pattern
        )
      }
    }
  })

  it("keeps GBP routes on queryable stores instead of SQLite route context", () => {
    const setupRoute = readFileSync("src/app/api/gbp/setup/route.ts", "utf8")
    const performanceRoute = readFileSync(
      "src/app/api/gbp/performance/route.ts",
      "utf8"
    )

    expect(setupRoute).toContain("withQueryableRouteDatabase")
    expect(setupRoute).toContain("readDatabaseSession")
    expect(setupRoute).toContain("gbpStore")
    expect(setupRoute).toContain("storeProfileRepository")
    expect(setupRoute).not.toContain(`with${"RouteDatabase"}`)
    expect(setupRoute).not.toContain(`legacy${"SqliteDatabase"}`)

    expect(performanceRoute).toContain("withQueryableRouteDatabase")
    expect(performanceRoute).toContain("readDatabaseSession")
    expect(performanceRoute).toContain("gbpStore")
    expect(performanceRoute).toContain("getGbpPerformanceSummary({")
    expect(performanceRoute).not.toContain(`legacy${"SqliteDatabase"}`)
  })
})
