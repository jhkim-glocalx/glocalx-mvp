import {
  getOAuthRequestOrigin,
  type OAuthOriginRequest,
  resolveOAuthRedirectUri,
} from "@/auth/oauth-redirect"
import type { AdapterEnvironment } from "@glocalx/integrations/contracts"

const googleOAuthEndpoint = "https://accounts.google.com/o/oauth2/v2/auth"
const googleOAuthEnvVars = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const
export const googleSignInScopes = ["openid", "email", "profile"] as const

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

export function buildGoogleOAuthAuthorizationUrl(
  options: GoogleOAuthAuthorizationUrlOptions
): URL {
  const authorizationUrl = new URL(googleOAuthEndpoint)
  authorizationUrl.searchParams.set("client_id", options.clientId)
  authorizationUrl.searchParams.set("redirect_uri", options.redirectUri)
  authorizationUrl.searchParams.set("response_type", "code")
  authorizationUrl.searchParams.set("scope", googleSignInScopes.join(" "))
  authorizationUrl.searchParams.set("state", options.state)
  authorizationUrl.searchParams.set("access_type", "offline")
  authorizationUrl.searchParams.set("prompt", "select_account")
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
