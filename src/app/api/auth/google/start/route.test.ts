import { NextRequest } from "next/server"
import { afterEach, describe, expect, it } from "vitest"

import { googleOAuthStateCookieName } from "@/gbp/oauth-callback"
import {
  buildGoogleOAuthAuthorizationUrl,
  missingGoogleOAuthEnvVars,
  POST,
} from "./route"

const envKeys = [
  "APP_INTEGRATION_MODE",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
] as const

const originalEnv = new Map(
  envKeys.map((key) => [key, process.env[key]] as const)
)

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

function createGoogleStartRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/google/start", {
    method: "POST",
  })
}

afterEach(() => {
  restoreEnv()
})

describe("Google OAuth start route", () => {
  it("builds the Google authorization URL with sign-in and GBP scopes", () => {
    const authorizationUrl = buildGoogleOAuthAuthorizationUrl({
      clientId: "test-client-id",
      redirectUri: "http://localhost:3000/api/auth/google/callback",
      state: "test-oauth-state",
    })

    expect(authorizationUrl.origin).toBe("https://accounts.google.com")
    expect(authorizationUrl.pathname).toBe("/o/oauth2/v2/auth")
    expect(authorizationUrl.searchParams.get("client_id")).toBe(
      "test-client-id"
    )
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/google/callback"
    )
    expect(authorizationUrl.searchParams.get("response_type")).toBe("code")
    expect(authorizationUrl.searchParams.get("state")).toBe("test-oauth-state")
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
  })

  it("redirects to Google when OAuth credentials are configured", async () => {
    replaceEnv({
      APP_INTEGRATION_MODE: "stub",
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
    expect(authorizationUrl.searchParams.get("client_id")).toBe(
      "test-client-id"
    )
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/google/callback"
    )
    expect(authorizationUrl.searchParams.get("state")).toBeTruthy()
    expect(setCookie).toContain(
      `${googleOAuthStateCookieName}=${authorizationUrl.searchParams.get("state")}`
    )
    expect(setCookie).toContain("HttpOnly")
  })

  it("reports missing credentials in production mode", async () => {
    replaceEnv({
      APP_INTEGRATION_MODE: "production",
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
      GOOGLE_REDIRECT_URI: undefined,
    })

    const response = await POST(createGoogleStartRequest())
    const body = (await response.json()) as {
      readonly code: string
      readonly missingEnvVars: readonly string[]
    }

    expect(response.status).toBe(500)
    expect(body).toEqual({
      code: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      message: "Google OAuth credentials are not configured.",
    })
  })

  it("treats template placeholders as missing credentials", () => {
    expect(
      missingGoogleOAuthEnvVars({
        GOOGLE_CLIENT_ID: "replace-with-google-client-id",
        GOOGLE_CLIENT_SECRET: "replace-with-google-client-secret",
      })
    ).toEqual(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"])
  })
})
