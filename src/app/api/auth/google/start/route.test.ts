import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { demoSessionCookieName, demoStoreCookieName } from "@/auth/session"
import { googleOAuthStateCookieName } from "@/gbp/oauth-callback"
import { POST } from "./route"

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

function createGoogleStartRequest(
  cookieHeader?: string,
  intent?: "gbp"
): NextRequest {
  const body =
    intent === undefined ? undefined : new URLSearchParams({ intent })
  if (cookieHeader === undefined) {
    return new NextRequest("http://localhost:3000/api/auth/google/start", {
      ...(body === undefined ? {} : { body }),
      headers: { Origin: "http://localhost:3000" },
      method: "POST",
    })
  }

  return new NextRequest("http://localhost:3000/api/auth/google/start", {
    headers: {
      Cookie: cookieHeader,
      Origin: "http://localhost:3000",
    },
    ...(body === undefined ? {} : { body }),
    method: "POST",
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
  restoreEnv()
})

describe("Google OAuth start route", () => {
  it("rejects cross-origin OAuth initiation", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/auth/google/start", {
        headers: { Origin: "https://attacker.example" },
        method: "POST",
      })
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe(
      "/?auth_error=invalid_request"
    )
    expect(response.headers.get("Set-Cookie")).toBeNull()
  })

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
    expect(authorizationUrl.searchParams.get("access_type")).toBeNull()
    expect(authorizationUrl.searchParams.get("prompt")).toBeNull()
    expect(
      authorizationUrl.searchParams.get("include_granted_scopes")
    ).toBeNull()
    expect(authorizationUrl.searchParams.get("scope")?.split(" ")).toEqual([
      "openid",
      "email",
      "profile",
    ])
    expect(setCookie).toContain(
      `${googleOAuthStateCookieName}=${authorizationUrl.searchParams.get("state")}`
    )
    expect(setCookie).toContain("HttpOnly")
    expect(setCookie).not.toContain(demoSessionCookieName)
    expect(setCookie).not.toContain(demoStoreCookieName)
  })

  it("requests offline business management access only for GBP connection", async () => {
    replaceEnv({
      GOOGLE_CLIENT_ID: "test-client-id",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
    })

    const response = await POST(createGoogleStartRequest(undefined, "gbp"))
    const authorizationUrl = new URL(response.headers.get("Location") ?? "")

    expect(authorizationUrl.searchParams.get("access_type")).toBe("offline")
    expect(authorizationUrl.searchParams.get("prompt")).toBe(
      "consent select_account"
    )
    expect(authorizationUrl.searchParams.get("scope")?.split(" ")).toContain(
      "https://www.googleapis.com/auth/business.manage"
    )
  })

  it("starts Google OAuth in stub integration mode when credentials are configured", async () => {
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
    expect(new URL(location ?? "").origin).toBe("https://accounts.google.com")
    expect(setCookie).toContain(googleOAuthStateCookieName)
    expect(setCookie).not.toContain(demoSessionCookieName)
    expect(setCookie).not.toContain(demoStoreCookieName)
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
        {
          headers: { Origin: "https://glocalx-mvp-tawny.vercel.app" },
          method: "POST",
        }
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

  it("redirects missing credentials to a visible configuration error in every integration mode", async () => {
    replaceEnv({
      APP_INTEGRATION_MODE: "production",
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
      GOOGLE_REDIRECT_URI: undefined,
    })

    const response = await POST(createGoogleStartRequest())
    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("/?auth_error=google_config")
  })

  it("treats template placeholders as missing credentials", async () => {
    replaceEnv({
      APP_INTEGRATION_MODE: "production",
      GOOGLE_CLIENT_ID: "replace-with-google-client-id",
      GOOGLE_CLIENT_SECRET: "replace-with-google-client-secret",
      GOOGLE_REDIRECT_URI: undefined,
    })

    const response = await POST(createGoogleStartRequest())
    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("/?auth_error=google_config")
  })
})
