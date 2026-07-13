import { createHash, randomUUID } from "node:crypto"

import type { SqliteDatabase } from "@/server/db/sqlite"
import { encryptToken } from "./token-encryption"

export type AuthProvider = "GOOGLE" | "KAKAO"

export type OAuthIdentityProfile = {
  readonly provider: AuthProvider
  readonly subjectId: string
  readonly email?: string
  readonly emailVerified: boolean
  readonly displayName: string
  readonly accessToken: string
  readonly refreshToken?: string
  readonly scopes: readonly string[]
  readonly expiresAt?: string
}

export type OAuthIdentitySession = {
  readonly userId: string
  readonly storeId: string
  readonly onboardingComplete: boolean
}

type UserRow = {
  readonly id: string
}

type StoreRow = {
  readonly id: string
  readonly onboarding_status: string
}

function stableId(prefix: string, ...parts: readonly string[]): string {
  const digest = createHash("sha256")
    .update(parts.join(":"))
    .digest("base64url")
  return `${prefix}-${digest.slice(0, 20)}`
}

function normalizeEmail(profile: OAuthIdentityProfile): string {
  const email = profile.email?.trim().toLowerCase()
  if (email && profile.emailVerified) {
    return email
  }

  return `${profile.provider.toLowerCase()}-${stableId("user", profile.provider, profile.subjectId)}@auth.glocalx.local`
}

function findUserIdByProviderIdentity(
  database: SqliteDatabase,
  profile: OAuthIdentityProfile
): string | undefined {
  const row = database
    .prepare(
      "SELECT user_id AS id FROM auth_identities WHERE provider = ? AND provider_subject_id = ?"
    )
    .get(profile.provider, profile.subjectId) as UserRow | undefined
  return row?.id
}

function findUserIdByEmail(
  database: SqliteDatabase,
  email: string
): string | undefined {
  const row = database
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(email) as UserRow | undefined
  return row?.id
}

function findOrCreateUser(
  database: SqliteDatabase,
  profile: OAuthIdentityProfile,
  createdAt: string
): string {
  const normalizedEmail = normalizeEmail(profile)
  const existingProviderUserId = findUserIdByProviderIdentity(database, profile)
  if (existingProviderUserId !== undefined) {
    return existingProviderUserId
  }

  const existingEmailUserId = findUserIdByEmail(database, normalizedEmail)
  if (existingEmailUserId !== undefined) {
    return existingEmailUserId
  }

  const userId = randomUUID()
  database
    .prepare(
      "INSERT INTO users (id, email, display_name, role, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(userId, normalizedEmail, profile.displayName, "OWNER", createdAt)
  return userId
}

function findOrCreatePrimaryStore(
  database: SqliteDatabase,
  userId: string,
  createdAt: string
): StoreRow {
  const existingStore = database
    .prepare(
      "SELECT id, onboarding_status FROM stores WHERE owner_user_id = ? ORDER BY created_at ASC LIMIT 1"
    )
    .get(userId) as StoreRow | undefined
  if (existingStore !== undefined) {
    return existingStore
  }

  const storeId = stableId("store", userId)
  database
    .prepare(
      "INSERT INTO stores (id, owner_user_id, name, address, phone, category, hours, onboarding_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      storeId,
      userId,
      "새 매장",
      "주소 입력 필요",
      null,
      "업종 입력 필요",
      null,
      "NOT_STARTED",
      createdAt
    )

  return {
    id: storeId,
    onboarding_status: "NOT_STARTED",
  }
}

export function upsertOAuthIdentity(
  database: SqliteDatabase,
  profile: OAuthIdentityProfile,
  now: Date = new Date()
): OAuthIdentitySession {
  const createdAt = now.toISOString()
  const email = normalizeEmail(profile)
  const userId = findOrCreateUser(database, profile, createdAt)
  const store = findOrCreatePrimaryStore(database, userId, createdAt)
  const identityId = stableId("auth", profile.provider, profile.subjectId)

  database
    .prepare(
      `INSERT INTO auth_identities (
        id,
        user_id,
        provider,
        provider_subject_id,
        email,
        display_name,
        encrypted_access_token,
        encrypted_refresh_token,
        scopes_json,
        expires_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, provider_subject_id) DO UPDATE SET
        user_id = excluded.user_id,
        email = excluded.email,
        display_name = excluded.display_name,
        encrypted_access_token = excluded.encrypted_access_token,
        encrypted_refresh_token = COALESCE(
          excluded.encrypted_refresh_token,
          auth_identities.encrypted_refresh_token
        ),
        scopes_json = excluded.scopes_json,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at`
    )
    .run(
      identityId,
      userId,
      profile.provider,
      profile.subjectId,
      email,
      profile.displayName,
      encryptToken(profile.accessToken),
      profile.refreshToken === undefined
        ? null
        : encryptToken(profile.refreshToken),
      JSON.stringify(profile.scopes),
      profile.expiresAt ?? null,
      createdAt,
      createdAt
    )

  return {
    onboardingComplete: store.onboarding_status === "COMPLETED",
    storeId: store.id,
    userId,
  }
}
