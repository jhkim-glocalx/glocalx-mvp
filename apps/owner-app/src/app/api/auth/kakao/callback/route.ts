import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import {
  fetchKakaoOAuthProfile,
  OAuthProviderError,
} from "@/auth/oauth-providers"
import { authSessionCookieName, sessionCookieOptions } from "@/auth/session"
import {
  expiredKakaoOAuthStateCookieOptions,
  getKakaoRedirectUri,
  isValidKakaoOAuthCallback,
  kakaoOAuthStateCookieName,
  missingKakaoOAuthEnvVars,
} from "@/auth/kakao-oauth"
import { missingTokenEncryptionEnvVars } from "@/auth/token-encryption"
import { withQueryableRouteDatabase } from "@/server/http"
import { OAuthAccountLinkRequiredError } from "@/server/repositories/oauth-account-owner"

function redirectToLandingClearingState(reason: string): NextResponse {
  const response = new NextResponse(null, {
    headers: {
      Location: `/?auth_error=${encodeURIComponent(reason)}`,
    },
    status: 303,
  })
  // Every callback exit clears state so stale browser retries fail closed.
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

  // Kakao tokens are stored, so production callbacks require encryption first.
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

    return await withQueryableRouteDatabase(
      async ({ oauthIdentityRepository, sessionStore }) => {
        const linkingSession = await sessionStore.readSessionFromCookieValues({
          authSessionId: request.cookies.get(authSessionCookieName)?.value,
          onboardingComplete: undefined,
          storeId: undefined,
          userId: undefined,
        })
        const session = await oauthIdentityRepository.upsertOAuthIdentity(
          profile,
          new Date(),
          linkingSession?.userId
        )
        const authenticatedSession =
          await sessionStore.createAuthenticatedSession(session)
        const response = new NextResponse(null, {
          headers: {
            // First login routes through onboarding until the owned store is complete.
            Location: session.onboardingComplete ? "/app" : "/onboarding",
          },
          status: 303,
        })
        response.cookies.set(
          authSessionCookieName,
          authenticatedSession.sessionId,
          sessionCookieOptions
        )
        response.cookies.set(
          kakaoOAuthStateCookieName,
          "",
          expiredKakaoOAuthStateCookieOptions
        )
        return response
      }
    )
  } catch (error) {
    if (error instanceof OAuthAccountLinkRequiredError) {
      return redirectToLandingClearingState("account_link_required")
    }
    console.error("Kakao OAuth callback failed", error)
    if (
      error instanceof OAuthProviderError &&
      error.status === 401 &&
      !hasConfiguredKakaoClientSecret()
    ) {
      // Kakao apps may require a client secret; surface that config fix directly.
      return redirectToLandingClearingState("kakao_client_secret")
    }

    return redirectToLandingClearingState("kakao_callback")
  }
}
