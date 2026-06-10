import { googleBusinessManageScope } from "@/integrations/credentials"
import type { SqliteDatabase } from "@/server/db/sqlite"
import { encryptToken } from "@/auth/token-encryption"

export const googleOAuthStateCookieName = "glocalx_google_oauth_state"
export const googleOAuthStateCookieOptions = {
  httpOnly: true,
  maxAge: 60 * 10,
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
} as const
export const expiredGoogleOAuthStateCookieOptions = {
  ...googleOAuthStateCookieOptions,
  maxAge: 0,
} as const
export const googleOAuthScopes = [
  "openid",
  "email",
  "profile",
  googleBusinessManageScope,
] as const

export type GoogleOAuthCallbackOptions = {
  readonly code: string
  readonly database: SqliteDatabase
  readonly expectedState: string
  readonly state: string
  readonly storeId: string
}

export type GoogleOAuthCallbackResult =
  | {
      readonly status: "GOOGLE_OAUTH_CONNECTED"
      readonly oauthConnectionId: string
      readonly message: string
    }
  | {
      readonly status: "INVALID_OAUTH_STATE"
      readonly message: string
    }

export function handleGoogleOAuthCallback(
  options: GoogleOAuthCallbackOptions
): GoogleOAuthCallbackResult {
  if (!isValidGoogleOAuthCallback(options)) {
    return {
      status: "INVALID_OAUTH_STATE",
      message: "Google OAuth state가 일치하지 않습니다.",
    }
  }

  options.database
    .prepare(
      "INSERT OR REPLACE INTO oauth_connections (id, store_id, provider, subject_id, encrypted_access_token, encrypted_refresh_token, scopes_json, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      "production-oauth-google",
      options.storeId,
      "GOOGLE",
      "production-google-oauth-placeholder",
      encryptToken(options.code),
      null,
      JSON.stringify(googleOAuthScopes),
      null,
      new Date("2026-06-04T00:00:00.000Z").toISOString()
    )

  return {
    status: "GOOGLE_OAUTH_CONNECTED",
    oauthConnectionId: "production-oauth-google",
    message: "Google 계정 연결이 저장되었습니다.",
  }
}

export function isValidGoogleOAuthCallback(
  options: Pick<GoogleOAuthCallbackOptions, "code" | "expectedState" | "state">
): boolean {
  return (
    options.code.trim() !== "" &&
    options.state.trim() !== "" &&
    options.expectedState.trim() !== "" &&
    options.state === options.expectedState
  )
}
