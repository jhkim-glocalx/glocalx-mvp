import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  demoStoreId,
  onboardingCompleteCookieName,
} from "@/auth/session"
import { googleOAuthStateCookieName } from "@/gbp/oauth-callback"
import {
  applyMigrations,
  openDatabase,
  resetDatabaseFile,
  seedDemoData,
} from "@/server/db/sqlite"
import { POST } from "./route"

type DemoStoreOnboardingStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED"

const envKeys = [
  "APP_INTEGRATION_MODE",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
] as const

const originalEnv = new Map(
  envKeys.map((key) => [key, process.env[key]] as const)
)
const testDatabasePath = ".glocalx/google-start-route.test.db"

function replaceEnv(overrides: Record<string, string | undefined>): void {
  for (const key of envKeys) {
    delete process.env[key]
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      process.env[key] = value
    }
  }
}

function restoreEnv(): void {
  for (const key of envKeys) {
    const value = originalEnv.get(key)
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

function createGoogleStartRequest(cookieHeader?: string): NextRequest {
  if (cookieHeader === undefined) {
    return new NextRequest("http://localhost:3000/api/auth/google/start", {
      method: "POST",
    })
  }

  return new NextRequest("http://localhost:3000/api/auth/google/start", {
    headers: {
      Cookie: cookieHeader,
    },
    method: "POST",
  })
}

function setDemoStoreOnboardingStatus(
  onboardingStatus: DemoStoreOnboardingStatus
): void {
  resetDatabaseFile()
  const database = openDatabase()
  try {
    applyMigrations(database)
    seedDemoData(database)
    database
      .prepare("UPDATE stores SET onboarding_status = ? WHERE id = ?")
      .run(onboardingStatus, demoStoreId)
  } finally {
    database.close()
  }
}

beforeEach(() => {
  vi.stubEnv("GLOCALX_DB_PATH", testDatabasePath)
  resetDatabaseFile(testDatabasePath)
})

afterEach(() => {
  resetDatabaseFile(testDatabasePath)
  vi.unstubAllEnvs()
  restoreEnv()
})

describe("Google OAuth start route", () => {
  it("redirects to Google when OAuth credentials are configured", async () => {
    replaceEnv({
      GOOGLE_CLIENT_ID: "test-client-id",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      GOOGLE_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback",
    })

    const response = await POST(createGoogleStartRequest())
    const location = response.headers.get("Location")
    const setCookie = response.headers.get("Set-Cookie")

    expect(response.status).toBe(303)
    expect(location).toBeTruthy()

    const authorizationUrl = new URL(location ?? "")
    expect(authorizationUrl.origin).toBe("https://accounts.google.com")
    expect(authorizationUrl.pathname).toBe("/o/oauth2/v2/auth")
    expect(authorizationUrl.searchParams.get("client_id")).toBe(
      "test-client-id"
    )
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/google/callback"
    )
    expect(authorizationUrl.searchParams.get("response_type")).toBe("code")
    expect(authorizationUrl.searchParams.get("state")).toBeTruthy()
    expect(authorizationUrl.searchParams.get("access_type")).toBe("offline")
    expect(authorizationUrl.searchParams.get("prompt")).toBe("consent")
    expect(authorizationUrl.searchParams.get("scope")?.split(" ")).toEqual(
      expect.arrayContaining([
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/business.manage",
      ])
    )
    expect(setCookie).toContain(
      `${googleOAuthStateCookieName}=${authorizationUrl.searchParams.get("state")}`
    )
    expect(setCookie).toContain("HttpOnly")
    expect(setCookie).not.toContain(demoSessionCookieName)
    expect(setCookie).not.toContain(demoStoreCookieName)
  })

  it("routes a not-started demo store to onboarding in stub mode", async () => {
    replaceEnv({
      APP_INTEGRATION_MODE: "stub",
      GOOGLE_CLIENT_ID: "test-client-id",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      GOOGLE_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback",
    })
    setDemoStoreOnboardingStatus("NOT_STARTED")

    const response = await POST(createGoogleStartRequest())
    const location = response.headers.get("Location")
    const setCookie = response.headers.get("Set-Cookie")

    expect(response.status).toBe(303)
    expect(location).toBe("/onboarding")
    expect(setCookie).toContain(`${demoSessionCookieName}=demo-owner`)
    expect(setCookie).toContain(`${demoStoreCookieName}=demo-store`)
    expect(setCookie).not.toContain(googleOAuthStateCookieName)
  })

  it("routes an in-progress demo store to onboarding in stub mode despite a stale completion cookie", async () => {
    replaceEnv({
      APP_INTEGRATION_MODE: "stub",
      GOOGLE_CLIENT_ID: "test-client-id",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      GOOGLE_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback",
    })
    setDemoStoreOnboardingStatus("IN_PROGRESS")

    const response = await POST(
      createGoogleStartRequest(`${onboardingCompleteCookieName}=true`)
    )
    const location = response.headers.get("Location")
    const setCookie = response.headers.get("Set-Cookie")

    expect(response.status).toBe(303)
    expect(location).toBe("/onboarding")
    expect(setCookie).toContain(`${demoSessionCookieName}=demo-owner`)
    expect(setCookie).toContain(`${demoStoreCookieName}=demo-store`)
    expect(setCookie).not.toContain(googleOAuthStateCookieName)
  })

  it("routes a completed demo store to app in stub mode", async () => {
    replaceEnv({
      APP_INTEGRATION_MODE: "stub",
      GOOGLE_CLIENT_ID: "test-client-id",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      GOOGLE_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback",
    })
    setDemoStoreOnboardingStatus("COMPLETED")

    const response = await POST(createGoogleStartRequest())
    const location = response.headers.get("Location")
    const setCookie = response.headers.get("Set-Cookie")

    expect(response.status).toBe(303)
    expect(location).toBe("/app")
    expect(setCookie).toContain(`${demoSessionCookieName}=demo-owner`)
    expect(setCookie).toContain(`${demoStoreCookieName}=demo-store`)
    expect(setCookie).not.toContain(googleOAuthStateCookieName)
  })

  it("uses the deployed origin when GOOGLE_REDIRECT_URI still points to localhost", async () => {
    replaceEnv({
      GOOGLE_CLIENT_ID: "test-client-id",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      GOOGLE_REDIRECT_URI: "http://127.0.0.1:5174/api/auth/google/callback",
    })

    const response = await POST(
      new NextRequest(
        "https://glocalx-mvp-tawny.vercel.app/api/auth/google/start",
        { method: "POST" }
      )
    )
    const location = response.headers.get("Location")

    expect(response.status).toBe(303)
    expect(location).toBeTruthy()

    const authorizationUrl = new URL(location ?? "")
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "https://glocalx-mvp-tawny.vercel.app/api/auth/google/callback"
    )
  })

  it("reports missing credentials in production mode", async () => {
    replaceEnv({
      APP_INTEGRATION_MODE: "production",
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
      GOOGLE_REDIRECT_URI: undefined,
    })

    const response = await POST(createGoogleStartRequest())
    const body: unknown = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({
      code: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      message: "Google OAuth credentials are not configured.",
    })
  })

  it("treats template placeholders as missing credentials", async () => {
    replaceEnv({
      APP_INTEGRATION_MODE: "production",
      GOOGLE_CLIENT_ID: "replace-with-google-client-id",
      GOOGLE_CLIENT_SECRET: "replace-with-google-client-secret",
      GOOGLE_REDIRECT_URI: undefined,
    })

    const response = await POST(createGoogleStartRequest())
    const body: unknown = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({
      code: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      message: "Google OAuth credentials are not configured.",
    })
  })
})
