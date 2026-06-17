import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  demoStoreId,
  demoUserId,
  ensureDemoOwnerStore,
  getStoredSessionFromCookieValues,
  sessionCookieOptions,
} from "@/auth/session"
import {
  buildGoogleOAuthAuthorizationUrl,
  getGoogleRedirectUri,
  missingGoogleOAuthEnvVars,
  shouldStartGoogleOAuth,
} from "@/auth/google-oauth"
import {
  googleOAuthStateCookieName,
  googleOAuthStateCookieOptions,
} from "@/gbp/oauth-callback"

export async function POST(request: NextRequest) {
  // Real Google OAuth is used only when env opts out of the demo branch.
  if (shouldStartGoogleOAuth(process.env)) {
    const missingEnvVars = missingGoogleOAuthEnvVars(process.env)
    if (missingEnvVars.length > 0) {
      return Response.json(
        {
          code: "BLOCKED_BY_CREDENTIALS",
          missingEnvVars,
          message: "Google OAuth credentials are not configured.",
        },
        { status: 500 }
      )
    }

    const state = crypto.randomUUID()
    const authorizationUrl = buildGoogleOAuthAuthorizationUrl({
      clientId: process.env["GOOGLE_CLIENT_ID"]?.trim() ?? "",
      redirectUri: getGoogleRedirectUri(request, process.env),
      state,
    })

    const response = new NextResponse(null, {
      headers: {
        Location: authorizationUrl.toString(),
      },
      status: 303,
    })
    response.cookies.set(
      googleOAuthStateCookieName,
      state,
      googleOAuthStateCookieOptions
    )
    return response
  }

  ensureDemoOwnerStore()

  // Demo login still consults stored onboarding state before first-login routing.
  const session = getStoredSessionFromCookieValues({
    onboardingComplete: undefined,
    storeId: demoStoreId,
    userId: demoUserId,
  })
  const onboardingComplete = session?.onboardingComplete ?? false
  const response = new NextResponse(null, {
    headers: {
      Location: onboardingComplete ? "/app" : "/onboarding",
    },
    status: 303,
  })

  response.cookies.set(demoSessionCookieName, demoUserId, sessionCookieOptions)
  response.cookies.set(demoStoreCookieName, demoStoreId, sessionCookieOptions)

  return response
}
