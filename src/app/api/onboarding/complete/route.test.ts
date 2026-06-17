import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  demoStoreId,
  demoUserId,
  onboardingCompleteCookieName,
} from "@/auth/session"
import {
  applyMigrations,
  openDatabase,
  resetDatabaseFile,
  seedDemoData,
} from "@/server/db/sqlite"
import { POST } from "./route"

const testDatabasePath = ".glocalx/onboarding-complete-route.test.db"

function createCompleteRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/onboarding/complete", {
    headers: {
      Cookie: `${demoSessionCookieName}=${demoUserId}; ${demoStoreCookieName}=${demoStoreId}`,
    },
    method: "POST",
  })
}

beforeEach(() => {
  vi.stubEnv("GLOCALX_DB_PATH", testDatabasePath)
  resetDatabaseFile(testDatabasePath)
  const database = openDatabase(testDatabasePath)
  try {
    applyMigrations(database)
    seedDemoData(database)
  } finally {
    database.close()
  }
})

afterEach(() => {
  resetDatabaseFile(testDatabasePath)
  vi.unstubAllEnvs()
})

describe("onboarding completion route", () => {
  it("redirects completed onboarding owners to marketing material creation", async () => {
    // Given: a valid owner submits the final onboarding form.
    const request = createCompleteRequest()

    // When: onboarding completion is persisted.
    const response = await POST(request)

    // Then: the app opens on marketing material creation, not the dashboard.
    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("/app?nav=photo")
    expect(response.headers.get("Set-Cookie")).toContain(
      `${onboardingCompleteCookieName}=true`
    )
  })
})
