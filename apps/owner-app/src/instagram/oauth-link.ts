import type { AdapterEnvironment } from "@glocalx/integrations/contracts"
import { instagramOAuthEnvVars } from "@glocalx/integrations/instagram-oauth"

import {
  getOAuthRequestOrigin,
  type OAuthOriginRequest,
  resolveOAuthRedirectUri,
} from "@/auth/oauth-redirect"

// The Instagram link flow attaches a channel to an already-authenticated
// owner's store; it never mints a session (unlike the Google *login* OAuth it
// is structurally modeled on).

// In stub mode the start route skips the Meta hop and drives its own callback
// with this deterministic code, which the stub adapter links unconditionally —
// keeping the whole connect flow demoable with no external redirect or creds.
export const stubInstagramConnectCode = "stub-instagram-code"

export const instagramOAuthStateCookieName = "glocalx_instagram_oauth_state"
// Route handlers set and expire this short-lived cookie to bind the callback to
// the owner + store that started the flow.
export const instagramOAuthStateCookieOptions = {
  httpOnly: true,
  maxAge: 60 * 10,
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
} as const
export const expiredInstagramOAuthStateCookieOptions = {
  ...instagramOAuthStateCookieOptions,
  maxAge: 0,
} as const

export type InstagramOAuthStateBinding = {
  // Echoed back as the `state` query param — the CSRF/replay guard.
  readonly nonce: string
  // The store the owner chose to connect; the callback confirms it still
  // matches the session before writing a link.
  readonly storeId: string
}

// Cookie value is `${nonce}:${storeId}`. The nonce is a UUID (no colon), so
// splitting on the first colon recovers a storeId that may itself contain
// colons without ambiguity.
export function encodeInstagramOAuthState(
  binding: InstagramOAuthStateBinding
): string {
  return `${binding.nonce}:${binding.storeId}`
}

export function parseInstagramOAuthState(
  cookieValue: string | undefined
): InstagramOAuthStateBinding | undefined {
  if (cookieValue === undefined) {
    return undefined
  }
  const separatorIndex = cookieValue.indexOf(":")
  if (separatorIndex <= 0) {
    return undefined
  }
  const nonce = cookieValue.slice(0, separatorIndex)
  const storeId = cookieValue.slice(separatorIndex + 1)
  if (nonce === "" || storeId === "") {
    return undefined
  }
  return { nonce, storeId }
}

// The security crux of the callback: a link is written only when the code is
// present, the returned state matches the cookie's nonce (not a replayed or
// forged callback), AND the bound store still matches the owner's current
// session (never write to a foreign or switched store).
export function isValidInstagramOAuthCallback(options: {
  readonly code: string
  readonly state: string
  readonly binding: InstagramOAuthStateBinding | undefined
  readonly sessionStoreId: string
}): boolean {
  return (
    options.code.trim() !== "" &&
    options.state.trim() !== "" &&
    options.binding !== undefined &&
    options.state === options.binding.nonce &&
    options.binding.storeId === options.sessionStoreId
  )
}

// Callback outcomes are surfaced to the owner as an opaque `?instagram=` flag on
// /onboarding — never a raw Meta/adapter error. Slice 3's onboarding card reads
// these same values to render connect / connected / needs-professional states.
export const instagramConnectResultParam = "instagram"
export type InstagramConnectResult =
  | "connected"
  | "needs_professional_account"
  | "error"

export function instagramConnectRedirectLocation(
  result: InstagramConnectResult
): string {
  return `/onboarding?${instagramConnectResultParam}=${result}`
}

function isConfiguredEnvValue(value: string | undefined): boolean {
  const trimmedValue = value?.trim()
  return Boolean(trimmedValue && !trimmedValue.startsWith("replace-with-"))
}

export function missingInstagramOAuthEnvVars(
  env: AdapterEnvironment
): readonly string[] {
  return instagramOAuthEnvVars.filter(
    (name) => !isConfiguredEnvValue(env[name])
  )
}

export function getInstagramOAuthRedirectUri(
  request: OAuthOriginRequest,
  env: AdapterEnvironment
): string {
  // Must byte-for-byte match the redirect_uri used at code-exchange time, so
  // both the start and callback routes resolve it the same way.
  const configuredRedirectUri = env["INSTAGRAM_OAUTH_REDIRECT_URI"]?.trim()
  return resolveOAuthRedirectUri({
    callbackPath: "/api/instagram/oauth/callback",
    configuredRedirectUri,
    requestOrigin: getOAuthRequestOrigin(request),
  })
}
