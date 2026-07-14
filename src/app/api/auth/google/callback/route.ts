import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { authSessionCookieName, sessionCookieOptions } from "@/auth/session"
import { fetchGoogleOAuthProfile } from "@/auth/oauth-providers"
import {
  getGoogleRedirectUri,
  missingGoogleOAuthEnvVars,
} from "@/auth/google-oauth"
import { missingTokenEncryptionEnvVars } from "@/auth/token-encryption"
import {
  expiredGoogleOAuthStateCookieOptions,
  googleOAuthIntentCookieName,
  googleOAuthStateCookieName,
  isValidGoogleOAuthCallback,
} from "@/gbp/oauth-callback"
import { withQueryableRouteDatabase } from "@/server/http"
import { OAuthAccountLinkRequiredError } from "@/server/repositories/oauth-account-owner"

function redirectToLandingClearingState(reason: string): NextResponse {
  const response = new NextResponse(null, {
    headers: {
      Location: `/?auth_error=${encodeURIComponent(reason)}`,
    },
    status: 303,
  })
  // Failures expire the one-time OAuth state so it cannot be replayed.
  response.cookies.set(
    googleOAuthStateCookieName,
    "",
    expiredGoogleOAuthStateCookieOptions
  )
  response.cookies.set(
    googleOAuthIntentCookieName,
    "",
    expiredGoogleOAuthStateCookieOptions
  )
  return response
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") ?? ""
  const state = request.nextUrl.searchParams.get("state") ?? ""
  const expectedState =
    request.cookies.get(googleOAuthStateCookieName)?.value ?? ""
  const oauthIntent =
    request.cookies.get(googleOAuthIntentCookieName)?.value ?? "signin"

  if (!isValidGoogleOAuthCallback({ code, expectedState, state })) {
    return redirectToLandingClearingState("google_state")
  }

  // A valid state is not enough if provider credentials drifted after start.
  if (missingGoogleOAuthEnvVars(process.env).length > 0) {
    return redirectToLandingClearingState("google_config")
  }

  if (missingTokenEncryptionEnvVars(process.env).length > 0) {
    return redirectToLandingClearingState("google_config")
  }

  try {
    const profile = await fetchGoogleOAuthProfile({
      clientId: process.env["GOOGLE_CLIENT_ID"]?.trim() ?? "",
      clientSecret: process.env["GOOGLE_CLIENT_SECRET"]?.trim() ?? "",
      code,
      redirectUri: getGoogleRedirectUri(request, process.env),
    })

    return await withQueryableRouteDatabase(
      async ({ gbpStore, oauthIdentityRepository, sessionStore }) => {
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
        if (oauthIntent === "gbp") {
          await gbpStore.persistGoogleConnection({
            now: new Date(),
            profile,
            storeId: session.storeId,
          })
        }
        const authenticatedSession =
          await sessionStore.createAuthenticatedSession(session)
        const shouldResumeGbpSetup =
          oauthIntent === "gbp" &&
          linkingSession !== undefined &&
          !session.onboardingComplete
        const response = new NextResponse(null, {
          headers: {
            // New OAuth identities enter onboarding until their store is completed.
            Location: session.onboardingComplete
              ? "/app"
              : shouldResumeGbpSetup
                ? "/onboarding?resume=gbp"
                : "/onboarding",
          },
          status: 303,
        })
        response.cookies.set(
          authSessionCookieName,
          authenticatedSession.sessionId,
          sessionCookieOptions
        )
        response.cookies.set(
          googleOAuthIntentCookieName,
          "",
          expiredGoogleOAuthStateCookieOptions
        )
        response.cookies.set(
          googleOAuthStateCookieName,
          "",
          expiredGoogleOAuthStateCookieOptions
        )
        return response
      }
    )
  } catch (error) {
    if (error instanceof OAuthAccountLinkRequiredError) {
      return redirectToLandingClearingState("account_link_required")
    }
    if (error instanceof Error) {
      console.error("Google OAuth callback failed", error)
    } else {
      console.error("Google OAuth callback failed with non-error rejection")
    }
    return redirectToLandingClearingState("google_callback")
  }
}
