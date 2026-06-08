import { NextRequest } from "next/server"
import { afterEach, describe, expect, it } from "vitest"

import {
  buildKakaoOAuthAuthorizationUrl,
  kakaoOAuthStateCookieName,
  missingKakaoOAuthEnvVars,
} from "@/auth/kakao-oauth"
import { getKakaoRedirectUri, POST } from "./route"

const envKeys = ["KAKAO_REST_API_KEY", "KAKAO_REDIRECT_URI"] as const

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

function createKakaoStartRequest(): NextRequest {
  return new NextRequest("http://127.0.0.1:5174/api/auth/kakao/start", {
    method: "POST",
  })
}

afterEach(() => {
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
      KAKAO_REDIRECT_URI: "http://127.0.0.1:5174/api/auth/kakao/callback",
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
      "http://127.0.0.1:5174/api/auth/kakao/callback"
    )
    expect(authorizationUrl.searchParams.get("state")).toBeTruthy()
    expect(setCookie).toContain(
      `${kakaoOAuthStateCookieName}=${authorizationUrl.searchParams.get("state")}`
    )
    expect(setCookie).toContain("HttpOnly")
  })

  it("uses the deployed origin when KAKAO_REDIRECT_URI still points to localhost", () => {
    const request = new NextRequest(
      "https://glocalx-mvp-tawny.vercel.app/api/auth/kakao/start",
      { method: "POST" }
    )

    expect(
      getKakaoRedirectUri(request, {
        KAKAO_REDIRECT_URI: "http://127.0.0.1:5174/api/auth/kakao/callback",
      })
    ).toBe("https://glocalx-mvp-tawny.vercel.app/api/auth/kakao/callback")
  })

  it("reports missing credentials", async () => {
    replaceEnv({
      KAKAO_REST_API_KEY: undefined,
      KAKAO_REDIRECT_URI: undefined,
    })

    const response = await POST(createKakaoStartRequest())
    const body = (await response.json()) as {
      readonly code: string
      readonly missingEnvVars: readonly string[]
    }

    expect(response.status).toBe(500)
    expect(body).toEqual({
      code: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: ["KAKAO_REST_API_KEY"],
      message: "Kakao OAuth credentials are not configured.",
    })
  })

  it("treats template placeholders as missing credentials", () => {
    expect(
      missingKakaoOAuthEnvVars({
        KAKAO_REST_API_KEY: "replace-with-kakao-rest-api-key",
      })
    ).toEqual(["KAKAO_REST_API_KEY"])
  })
})
