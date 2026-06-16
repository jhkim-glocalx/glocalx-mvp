import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  buildKakaoOAuthAuthorizationUrl,
  kakaoOAuthStateCookieName,
  missingKakaoOAuthEnvVars,
} from "@/auth/kakao-oauth"
import { demoSessionCookieName, demoStoreCookieName } from "@/auth/session"
import { resetDatabaseFile } from "@/server/db/sqlite"
import { POST } from "./route"

const envKeys = [
  "APP_INTEGRATION_MODE",
  "KAKAO_REST_API_KEY",
  "KAKAO_REDIRECT_URI",
] as const

const originalEnv = new Map(
  envKeys.map((key) => [key, process.env[key]] as const)
)
const testDatabasePath = ".glocalx/kakao-start-route.test.db"

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

function createKakaoStartRequest(): NextRequest {
  return new NextRequest("http://127.0.0.1:5174/api/auth/kakao/start", {
    method: "POST",
  })
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

describe("Kakao OAuth start route", () => {
  it("builds the Kakao authorization URL", () => {
    const authorizationUrl = buildKakaoOAuthAuthorizationUrl({
      clientId: "test-rest-api-key",
      redirectUri: "http://127.0.0.1:5174/api/auth/kakao/callback",
      state: "test-kakao-state",
    })

    expect(authorizationUrl.origin).toBe("https://kauth.kakao.com")
    expect(authorizationUrl.pathname).toBe("/oauth/authorize")
    expect(authorizationUrl.searchParams.get("client_id")).toBe(
      "test-rest-api-key"
    )
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "http://127.0.0.1:5174/api/auth/kakao/callback"
    )
    expect(authorizationUrl.searchParams.get("response_type")).toBe("code")
    expect(authorizationUrl.searchParams.get("state")).toBe("test-kakao-state")
  })

  it("redirects to Kakao when OAuth credentials are configured", async () => {
    replaceEnv({
      KAKAO_REST_API_KEY: "test-rest-api-key",
      KAKAO_REDIRECT_URI: "http://localhost:5174/api/auth/kakao/callback",
    })

    const response = await POST(createKakaoStartRequest())
    const location = response.headers.get("Location")
    const setCookie = response.headers.get("Set-Cookie")

    expect(response.status).toBe(303)
    expect(location).toBeTruthy()

    const authorizationUrl = new URL(location ?? "")
    expect(authorizationUrl.origin).toBe("https://kauth.kakao.com")
    expect(authorizationUrl.searchParams.get("client_id")).toBe(
      "test-rest-api-key"
    )
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "http://localhost:5174/api/auth/kakao/callback"
    )
    expect(authorizationUrl.searchParams.get("state")).toBeTruthy()
    expect(setCookie).toContain(
      `${kakaoOAuthStateCookieName}=${authorizationUrl.searchParams.get("state")}`
    )
    expect(setCookie).toContain("HttpOnly")
  })

  it("uses demo login in stub mode even when Kakao credentials are configured", async () => {
    replaceEnv({
      APP_INTEGRATION_MODE: "stub",
      KAKAO_REST_API_KEY: "test-rest-api-key",
      KAKAO_REDIRECT_URI: "http://127.0.0.1:5174/api/auth/kakao/callback",
    })

    const response = await POST(createKakaoStartRequest())
    const location = response.headers.get("Location")
    const setCookie = response.headers.get("Set-Cookie")

    expect(response.status).toBe(303)
    expect(location).toMatch(/^\/(?:app|onboarding)$/)
    expect(setCookie).toContain(`${demoSessionCookieName}=demo-owner`)
    expect(setCookie).toContain(`${demoStoreCookieName}=demo-store`)
    expect(setCookie).not.toContain(kakaoOAuthStateCookieName)
  })

  it("uses the deployed origin when KAKAO_REDIRECT_URI still points to localhost", async () => {
    replaceEnv({
      KAKAO_REST_API_KEY: "test-rest-api-key",
      KAKAO_REDIRECT_URI: "http://127.0.0.1:5174/api/auth/kakao/callback",
    })

    const response = await POST(
      new NextRequest(
        "https://glocalx-mvp-tawny.vercel.app/api/auth/kakao/start",
        { method: "POST" }
      )
    )
    const location = response.headers.get("Location")

    expect(response.status).toBe(303)
    expect(location).toBeTruthy()
    expect(new URL(location ?? "").searchParams.get("redirect_uri")).toBe(
      "https://glocalx-mvp-tawny.vercel.app/api/auth/kakao/callback"
    )
  })

  it("falls back to demo login when local Kakao credentials are missing", async () => {
    replaceEnv({
      APP_INTEGRATION_MODE: "stub",
      KAKAO_REST_API_KEY: undefined,
      KAKAO_REDIRECT_URI: undefined,
    })

    const response = await POST(createKakaoStartRequest())
    const location = response.headers.get("Location")
    const setCookie = response.headers.get("Set-Cookie")

    expect(response.status).toBe(303)
    expect(location).toMatch(/^\/(?:app|onboarding)$/)
    expect(setCookie).toContain(`${demoSessionCookieName}=demo-owner`)
    expect(setCookie).toContain(`${demoStoreCookieName}=demo-store`)
    expect(setCookie).toContain("HttpOnly")
  })

  it("redirects to an auth error when local Kakao credentials are missing outside stub mode", async () => {
    replaceEnv({
      APP_INTEGRATION_MODE: undefined,
      KAKAO_REST_API_KEY: undefined,
      KAKAO_REDIRECT_URI: undefined,
    })

    const response = await POST(createKakaoStartRequest())

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("/?auth_error=kakao_config")
    expect(response.headers.get("Set-Cookie")).toBeNull()
  })

  it("redirects to an auth error when production Kakao credentials are missing", async () => {
    replaceEnv({
      APP_INTEGRATION_MODE: "production",
      KAKAO_REST_API_KEY: undefined,
      KAKAO_REDIRECT_URI: undefined,
    })
    vi.stubEnv("NODE_ENV", "production")

    const response = await POST(
      new NextRequest("https://glocalx.example/api/auth/kakao/start", {
        method: "POST",
      })
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("/?auth_error=kakao_config")
    expect(response.headers.get("Set-Cookie")).toBeNull()
  })

  it("treats template placeholders as missing credentials", () => {
    expect(
      missingKakaoOAuthEnvVars({
        KAKAO_REST_API_KEY: "replace-with-kakao-rest-api-key",
      })
    ).toEqual(["KAKAO_REST_API_KEY"])
  })
})
