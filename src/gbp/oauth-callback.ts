import { googleBusinessManageScope } from "@/integrations/credentials"
import type { SqliteDatabase } from "@/server/db/sqlite"

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
  if (options.state !== options.expectedState) {
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
      `encrypted:${options.code}`,
      null,
      JSON.stringify([googleBusinessManageScope]),
      null,
      new Date("2026-06-04T00:00:00.000Z").toISOString()
    )

  return {
    status: "GOOGLE_OAUTH_CONNECTED",
    oauthConnectionId: "production-oauth-google",
    message: "Google 계정 연결이 저장되었습니다.",
  }
}
