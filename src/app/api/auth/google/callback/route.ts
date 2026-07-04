import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  sessionCookieOptions,
} from "@/auth/session"
import { fetchGoogleOAuthProfile } from "@/auth/oauth-providers"
import {
  getGoogleRedirectUri,
  missingGoogleOAuthEnvVars,
} from "@/auth/google-oauth"
import {
  expiredGoogleOAuthStateCookieOptions,
  googleOAuthStateCookieName,
  isValidGoogleOAuthCallback,
} from "@/gbp/oauth-callback"
import { withQueryableRouteDatabase } from "@/server/http"

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
  return response
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") ?? ""
  const state = request.nextUrl.searchParams.get("state") ?? ""
  const expectedState =
    request.cookies.get(googleOAuthStateCookieName)?.value ?? ""

  if (!isValidGoogleOAuthCallback({ code, expectedState, state })) {
    return redirectToLandingClearingState("google_state")
  }

  // A valid state is not enough if provider credentials drifted after start.
  if (missingGoogleOAuthEnvVars(process.env).length > 0) {
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
      async ({ oauthIdentityRepository }) => {
        const session =
          await oauthIdentityRepository.upsertOAuthIdentity(profile)
        const response = new NextResponse(null, {
          headers: {
            // New OAuth identities enter onboarding until their store is completed.
            Location: session.onboardingComplete ? "/app" : "/onboarding",
          },
          status: 303,
        })
        response.cookies.set(
          demoSessionCookieName,
          session.userId,
          sessionCookieOptions
        )
        response.cookies.set(
          demoStoreCookieName,
          session.storeId,
          sessionCookieOptions
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
    if (error instanceof Error) {
      console.error("Google OAuth callback failed", error)
    } else {
      console.error("Google OAuth callback failed with non-error rejection")
    }
    return redirectToLandingClearingState("google_callback")
  }
}
