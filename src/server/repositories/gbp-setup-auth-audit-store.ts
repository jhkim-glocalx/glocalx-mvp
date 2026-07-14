import { encryptToken } from "@/auth/token-encryption"
import type { OAuthIdentityProfile } from "@/auth/oauth-identity"
import type { LocationStatus } from "@/domain/location-status"
import { googleBusinessManageScope } from "@/integrations/credentials"
import type { Queryable } from "@/server/db"

import {
  setupOAuthConnectionId,
  setupResultStatus,
  type PersistStubSetupGbpRecordsOptions,
} from "./gbp-setup-record-values"

export async function persistGoogleOAuthConnection(options: {
  readonly now: Date
  readonly profile: OAuthIdentityProfile
  readonly queryable: Queryable
  readonly storeId: string
}): Promise<void> {
  await options.queryable.execute(
    `INSERT INTO oauth_connections (
      id, store_id, provider, subject_id, encrypted_access_token,
      encrypted_refresh_token, scopes_json, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      subject_id = excluded.subject_id,
      encrypted_access_token = excluded.encrypted_access_token,
      encrypted_refresh_token = CASE
        WHEN oauth_connections.subject_id = excluded.subject_id
          THEN COALESCE(
            excluded.encrypted_refresh_token,
            oauth_connections.encrypted_refresh_token
          )
        ELSE excluded.encrypted_refresh_token
      END,
      scopes_json = excluded.scopes_json,
      expires_at = excluded.expires_at,
      created_at = excluded.created_at`,
    [
      `gbp-oauth-${options.storeId}`,
      options.storeId,
      "GOOGLE",
      options.profile.subjectId,
      encryptToken(options.profile.accessToken),
      options.profile.refreshToken === undefined
        ? null
        : encryptToken(options.profile.refreshToken),
      JSON.stringify(options.profile.scopes),
      options.profile.expiresAt ?? null,
      options.now.toISOString(),
    ]
  )
}

export async function persistStubOAuthConnection(
  options: PersistStubSetupGbpRecordsOptions & {
    readonly createdAt: string
  }
): Promise<void> {
  await options.queryable.execute(
    `INSERT INTO oauth_connections (
      id,
      store_id,
      provider,
      subject_id,
      encrypted_access_token,
      encrypted_refresh_token,
      scopes_json,
      expires_at,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      store_id = excluded.store_id,
      provider = excluded.provider,
      subject_id = excluded.subject_id,
      encrypted_access_token = excluded.encrypted_access_token,
      encrypted_refresh_token = excluded.encrypted_refresh_token,
      scopes_json = excluded.scopes_json,
      expires_at = excluded.expires_at,
      created_at = excluded.created_at`,
    [
      setupOAuthConnectionId,
      options.storeId,
      "GOOGLE",
      options.subjectId,
      encryptToken("stub-access-token"),
      encryptToken("stub-refresh-token"),
      JSON.stringify([googleBusinessManageScope]),
      "2026-06-05T00:00:00.000Z",
      options.createdAt,
    ]
  )
}

export async function appendSetupAuditLog(options: {
  readonly auditLogId: string
  readonly createdAt: string
  readonly mode: "stub" | "production"
  readonly queryable: Queryable
  readonly status: LocationStatus
  readonly storeId: string
}): Promise<void> {
  await options.queryable.execute(
    `INSERT INTO audit_logs (
      id,
      store_id,
      actor_user_id,
      action,
      idempotency_key,
      redacted_payload_json,
      created_at
    ) VALUES (?, ?, (SELECT owner_user_id FROM stores WHERE id = ?), ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      store_id = excluded.store_id,
      actor_user_id = excluded.actor_user_id,
      action = excluded.action,
      idempotency_key = excluded.idempotency_key,
      redacted_payload_json = excluded.redacted_payload_json,
      created_at = excluded.created_at`,
    [
      options.auditLogId,
      options.storeId,
      options.storeId,
      `gbp.setup.${options.mode}`,
      `${options.auditLogId}-key`,
      JSON.stringify({
        accessToken: "[REDACTED]",
        status: setupResultStatus(options.status),
      }),
      options.createdAt,
    ]
  )
}
