import { createHash } from "node:crypto"

import type {
  OAuthIdentityProfile,
  OAuthIdentitySession,
} from "@/auth/oauth-identity"
import { encryptToken } from "@/auth/token-encryption"
import type { Queryable } from "@/server/db"
import { z } from "zod"

export interface OAuthIdentityRepository {
  upsertOAuthIdentity(
    profile: OAuthIdentityProfile,
    now?: Date
  ): Promise<OAuthIdentitySession>
}

const userRowSchema = z.object({
  id: z.string(),
})

const storeRowSchema = z.object({
  id: z.string(),
  onboarding_status: z.string(),
})

function stableId(prefix: string, ...parts: readonly string[]): string {
  const digest = createHash("sha256")
    .update(parts.join(":"))
    .digest("base64url")
  return `${prefix}-${digest.slice(0, 20)}`
}

function normalizeEmail(profile: OAuthIdentityProfile): string {
  const email = profile.email?.trim().toLowerCase()
  if (email) {
    return email
  }

  return `${profile.provider.toLowerCase()}-${stableId("user", profile.provider, profile.subjectId)}@auth.glocalx.local`
}

async function findUserIdByProviderIdentity(
  queryable: Queryable,
  profile: OAuthIdentityProfile
): Promise<string | undefined> {
  const row = await queryable.queryOne(
    "SELECT user_id AS id FROM auth_identities WHERE provider = ? AND provider_subject_id = ?",
    [profile.provider, profile.subjectId]
  )
  const parsed = userRowSchema.safeParse(row)
  return parsed.success ? parsed.data.id : undefined
}

async function findUserIdByEmail(
  queryable: Queryable,
  email: string
): Promise<string | undefined> {
  const row = await queryable.queryOne("SELECT id FROM users WHERE email = ?", [
    email,
  ])
  const parsed = userRowSchema.safeParse(row)
  return parsed.success ? parsed.data.id : undefined
}

async function findOrCreateUser(
  queryable: Queryable,
  profile: OAuthIdentityProfile,
  createdAt: string
): Promise<string> {
  const email = normalizeEmail(profile)
  const existingProviderUserId = await findUserIdByProviderIdentity(
    queryable,
    profile
  )
  if (existingProviderUserId !== undefined) {
    return existingProviderUserId
  }

  const existingEmailUserId = await findUserIdByEmail(queryable, email)
  if (existingEmailUserId !== undefined) {
    return existingEmailUserId
  }

  const userId = stableId("user", profile.provider, profile.subjectId)
  await queryable.execute(
    "INSERT INTO users (id, email, display_name, role, created_at) VALUES (?, ?, ?, ?, ?)",
    [userId, email, profile.displayName, "OWNER", createdAt]
  )
  return userId
}

async function findOrCreatePrimaryStore(
  queryable: Queryable,
  userId: string,
  createdAt: string
): Promise<z.infer<typeof storeRowSchema>> {
  const existingStore = storeRowSchema.safeParse(
    await queryable.queryOne(
      "SELECT id, onboarding_status FROM stores WHERE owner_user_id = ? ORDER BY created_at ASC LIMIT 1",
      [userId]
    )
  )
  if (existingStore.success) {
    return existingStore.data
  }

  const storeId = stableId("store", userId)
  await queryable.execute(
    "INSERT INTO stores (id, owner_user_id, name, address, phone, category, hours, onboarding_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      storeId,
      userId,
      "새 매장",
      "주소 입력 필요",
      null,
      "업종 입력 필요",
      null,
      "NOT_STARTED",
      createdAt,
    ]
  )

  return {
    id: storeId,
    onboarding_status: "NOT_STARTED",
  }
}

export function createDatabaseOAuthIdentityRepository(
  queryable: Queryable
): OAuthIdentityRepository {
  return {
    async upsertOAuthIdentity(profile, now = new Date()) {
      const createdAt = now.toISOString()
      const email = normalizeEmail(profile)
      const userId = await findOrCreateUser(queryable, profile, createdAt)
      const store = await findOrCreatePrimaryStore(queryable, userId, createdAt)
      const identityId = stableId("auth", profile.provider, profile.subjectId)

      await queryable.execute(
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
          updated_at = excluded.updated_at`,
        [
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
          createdAt,
        ]
      )

      return {
        onboardingComplete: store.onboarding_status === "COMPLETED",
        storeId: store.id,
        userId,
      }
    },
  }
}
