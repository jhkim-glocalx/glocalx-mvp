import { describe, expect, it } from "vitest"

import {
  fetchGoogleOAuthProfile,
  fetchKakaoOAuthProfile,
  googleOAuthTokenEndpoint,
  googleOAuthUserInfoEndpoint,
  kakaoOAuthTokenEndpoint,
  kakaoOAuthUserInfoEndpoint,
  type OAuthFetch,
  type OAuthProviderError,
} from "./oauth-providers"

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  })
}

function readFormBody(init: RequestInit | undefined): URLSearchParams {
  expect(init?.body).toBeInstanceOf(URLSearchParams)
  return init?.body as URLSearchParams
}

describe("OAuth provider clients", () => {
  it("exchanges a Google code and fetches the user profile", async () => {
    const seenUrls: string[] = []
    const fetchImpl: OAuthFetch = async (input, init) => {
      seenUrls.push(input)
      if (input === googleOAuthTokenEndpoint) {
        const form = readFormBody(init)
        expect(form.get("client_id")).toBe("google-client")
        expect(form.get("client_secret")).toBe("google-secret")
        expect(form.get("code")).toBe("google-code")
        expect(form.get("grant_type")).toBe("authorization_code")
        expect(form.get("redirect_uri")).toBe(
          "http://127.0.0.1:5174/api/auth/google/callback"
        )
        return jsonResponse({
          access_token: "google-access",
          expires_in: 3600,
          refresh_token: "google-refresh",
          scope: "openid email profile",
        })
      }

      expect(input).toBe(googleOAuthUserInfoEndpoint)
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer google-access",
      })
      return jsonResponse({
        email: "owner@example.com",
        email_verified: true,
        name: "Google Owner",
        sub: "google-subject",
      })
    }

    const profile = await fetchGoogleOAuthProfile({
      clientId: "google-client",
      clientSecret: "google-secret",
      code: "google-code",
      fetchImpl,
      now: new Date("2026-06-04T00:00:00.000Z"),
      redirectUri: "http://127.0.0.1:5174/api/auth/google/callback",
    })

    expect(seenUrls).toEqual([
      googleOAuthTokenEndpoint,
      googleOAuthUserInfoEndpoint,
    ])
    expect(profile).toEqual({
      accessToken: "google-access",
      displayName: "Google Owner",
      email: "owner@example.com",
      emailVerified: true,
      expiresAt: "2026-06-04T01:00:00.000Z",
      provider: "GOOGLE",
      refreshToken: "google-refresh",
      scopes: ["openid", "email", "profile"],
      subjectId: "google-subject",
    })
  })

  it("exchanges a Kakao code and fetches the user profile", async () => {
    const fetchImpl: OAuthFetch = async (input, init) => {
      if (input === kakaoOAuthTokenEndpoint) {
        const form = readFormBody(init)
        expect(form.get("client_id")).toBe("kakao-rest-key")
        expect(form.get("client_secret")).toBe("kakao-client-secret")
        expect(form.get("code")).toBe("kakao-code")
        expect(form.get("grant_type")).toBe("authorization_code")
        expect(form.get("redirect_uri")).toBe(
          "http://127.0.0.1:5174/api/auth/kakao/callback"
        )
        return jsonResponse({
          access_token: "kakao-access",
          expires_in: 7200,
          refresh_token: "kakao-refresh",
          scope: "profile_nickname account_email",
        })
      }

      expect(input).toBe(kakaoOAuthUserInfoEndpoint)
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer kakao-access",
      })
      return jsonResponse({
        id: 123456789,
        kakao_account: {
          email: "owner@kakao.example",
          is_email_valid: true,
          is_email_verified: true,
          profile: {
            nickname: "Kakao Owner",
          },
        },
      })
    }

    const profile = await fetchKakaoOAuthProfile({
      clientId: "kakao-rest-key",
      clientSecret: "kakao-client-secret",
      code: "kakao-code",
      fetchImpl,
      now: new Date("2026-06-04T00:00:00.000Z"),
      redirectUri: "http://127.0.0.1:5174/api/auth/kakao/callback",
    })

    expect(profile).toEqual({
      accessToken: "kakao-access",
      displayName: "Kakao Owner",
      email: "owner@kakao.example",
      emailVerified: true,
      expiresAt: "2026-06-04T02:00:00.000Z",
      provider: "KAKAO",
      refreshToken: "kakao-refresh",
      scopes: ["profile_nickname", "account_email"],
      subjectId: "123456789",
    })
  })

  it("preserves Kakao token error details", async () => {
    const fetchImpl: OAuthFetch = async () =>
      jsonResponse(
        {
          error: "invalid_client",
          error_code: "KOE010",
          error_description: "Bad client credentials",
        },
        401
      )

    await expect(
      fetchKakaoOAuthProfile({
        clientId: "kakao-rest-key",
        code: "kakao-code",
        fetchImpl,
        redirectUri: "http://127.0.0.1:3000/api/auth/kakao/callback",
      })
    ).rejects.toMatchObject({
      error: "invalid_client",
      errorCode: "KOE010",
      errorDescription: "Bad client credentials",
      provider: "Kakao",
      status: 401,
    } satisfies Partial<OAuthProviderError>)
  })
})
