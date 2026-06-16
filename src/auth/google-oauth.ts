import {
  getOAuthRequestOrigin,
  type OAuthOriginRequest,
  resolveOAuthRedirectUri,
} from "@/auth/oauth-redirect"
import { googleOAuthScopes } from "@/gbp/oauth-callback"
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
    env["APP_INTEGRATION_MODE"] !== "stub" &&
    (env["APP_INTEGRATION_MODE"] === "production" ||
      missingGoogleOAuthEnvVars(env).length === 0)
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
  request: OAuthOriginRequest,
  env: AdapterEnvironment
): string {
  const configuredRedirectUri = env["GOOGLE_REDIRECT_URI"]?.trim()
  return resolveOAuthRedirectUri({
    callbackPath: "/api/auth/google/callback",
    configuredRedirectUri,
    requestOrigin: getOAuthRequestOrigin(request),
  })
}
