import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { upsertOAuthIdentity } from "@/auth/oauth-identity"
import {
  fetchKakaoOAuthProfile,
  OAuthProviderError,
} from "@/auth/oauth-providers"
import {
  demoSessionCookieName,
  demoStoreCookieName,
  ensureDemoOwnerStore,
  sessionCookieOptions,
} from "@/auth/session"
import {
  expiredKakaoOAuthStateCookieOptions,
  getKakaoRedirectUri,
  isValidKakaoOAuthCallback,
  kakaoOAuthStateCookieName,
  missingKakaoOAuthEnvVars,
} from "@/auth/kakao-oauth"
import { missingTokenEncryptionEnvVars } from "@/auth/token-encryption"
import { openDatabase } from "@/server/db/sqlite"

function redirectToLandingClearingState(reason: string): NextResponse {
  const response = new NextResponse(null, {
    headers: {
      Location: `/?auth_error=${encodeURIComponent(reason)}`,
    },
    status: 303,
  })
  response.cookies.set(
    kakaoOAuthStateCookieName,
    "",
    expiredKakaoOAuthStateCookieOptions
  )
  return response
}

function hasConfiguredKakaoClientSecret(): boolean {
  return (process.env["KAKAO_CLIENT_SECRET"]?.trim() ?? "") !== ""
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") ?? ""
  const state = request.nextUrl.searchParams.get("state") ?? ""
  const expectedState =
    request.cookies.get(kakaoOAuthStateCookieName)?.value ?? ""

  if (!isValidKakaoOAuthCallback({ code, expectedState, state })) {
    return redirectToLandingClearingState("kakao_state")
  }

  if (missingKakaoOAuthEnvVars(process.env).length > 0) {
    return redirectToLandingClearingState("kakao_config")
  }

  if (missingTokenEncryptionEnvVars(process.env).length > 0) {
    return redirectToLandingClearingState("kakao_config")
  }

  try {
    const clientSecret = process.env["KAKAO_CLIENT_SECRET"]?.trim()
    const profile = await fetchKakaoOAuthProfile({
      clientId: process.env["KAKAO_REST_API_KEY"]?.trim() ?? "",
      code,
      redirectUri: getKakaoRedirectUri(request, process.env),
      ...(clientSecret === undefined ? {} : { clientSecret }),
    })
    ensureDemoOwnerStore()
    const database = openDatabase()
    let storeOnboardingComplete = false
    let userId = ""
    let storeId = ""
    try {
      const session = upsertOAuthIdentity(database, profile)
      storeOnboardingComplete = session.onboardingComplete
      userId = session.userId
      storeId = session.storeId
    } finally {
      database.close()
    }

    const response = new NextResponse(null, {
      headers: {
        Location: storeOnboardingComplete ? "/app" : "/onboarding",
      },
      status: 303,
    })
    response.cookies.set(demoSessionCookieName, userId, sessionCookieOptions)
    response.cookies.set(demoStoreCookieName, storeId, sessionCookieOptions)
    response.cookies.set(
      kakaoOAuthStateCookieName,
      "",
      expiredKakaoOAuthStateCookieOptions
    )
    return response
  } catch (error) {
    console.error("Kakao OAuth callback failed", error)
    if (
      error instanceof OAuthProviderError &&
      error.status === 401 &&
      !hasConfiguredKakaoClientSecret()
    ) {
      return redirectToLandingClearingState("kakao_client_secret")
    }

    return redirectToLandingClearingState("kakao_callback")
  }
}
