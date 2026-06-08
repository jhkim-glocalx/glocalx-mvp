import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  demoStoreId,
  demoUserId,
  ensureDemoOwnerStore,
  onboardingCompleteCookieName,
  sessionCookieOptions,
} from "@/auth/session"
import { resolveOAuthRedirectUri } from "@/auth/oauth-redirect"
import {
  googleOAuthStateCookieName,
  googleOAuthStateCookieOptions,
  googleOAuthScopes,
} from "@/gbp/oauth-callback"
import type { AdapterEnvironment } from "@/integrations/contracts"

const googleOAuthEndpoint = "https://accounts.google.com/o/oauth2/v2/auth"
const googleOAuthEnvVars = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const

type GoogleOAuthAuthorizationUrlOptions = {
  readonly clientId: string
  readonly redirectUri: string
  readonly state: string
}

function isConfiguredEnvValue(value: string | undefined): boolean {
  const trimmedValue = value?.trim()
  return Boolean(trimmedValue && !trimmedValue.startsWith("replace-with-"))
}

export function missingGoogleOAuthEnvVars(
  env: AdapterEnvironment
): readonly string[] {
  return googleOAuthEnvVars.filter((name) => !isConfiguredEnvValue(env[name]))
}

export function shouldStartGoogleOAuth(env: AdapterEnvironment): boolean {
  return (
    env["APP_INTEGRATION_MODE"] === "production" ||
    missingGoogleOAuthEnvVars(env).length === 0
  )
}

export function buildGoogleOAuthAuthorizationUrl(
  options: GoogleOAuthAuthorizationUrlOptions
): URL {
  const authorizationUrl = new URL(googleOAuthEndpoint)
  authorizationUrl.searchParams.set("client_id", options.clientId)
  authorizationUrl.searchParams.set("redirect_uri", options.redirectUri)
  authorizationUrl.searchParams.set("response_type", "code")
  authorizationUrl.searchParams.set("scope", googleOAuthScopes.join(" "))
  authorizationUrl.searchParams.set("state", options.state)
  authorizationUrl.searchParams.set("access_type", "offline")
  authorizationUrl.searchParams.set("prompt", "consent")
  return authorizationUrl
}

export function getGoogleRedirectUri(
  request: NextRequest,
  env: AdapterEnvironment
): string {
  const configuredRedirectUri = env["GOOGLE_REDIRECT_URI"]?.trim()
  return resolveOAuthRedirectUri({
    callbackPath: "/api/auth/google/callback",
    configuredRedirectUri,
    requestOrigin: request.nextUrl.origin,
  })
}

export async function POST(request: NextRequest) {
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

  const onboardingComplete =
    request.cookies.get(onboardingCompleteCookieName)?.value === "true"
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
