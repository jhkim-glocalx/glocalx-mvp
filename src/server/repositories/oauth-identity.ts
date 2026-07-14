import { createHash } from "node:crypto"

import type {
  OAuthIdentityProfile,
  OAuthIdentitySession,
} from "@/auth/oauth-identity"
import { encryptToken } from "@/auth/token-encryption"
import type { Queryable } from "@/server/db"
import { z } from "zod"

import {
  findOrCreateOAuthUser,
  OAuthAccountLinkRequiredError,
} from "./oauth-account-owner"

export interface OAuthIdentityRepository {
  upsertOAuthIdentity(
    profile: OAuthIdentityProfile,
    now?: Date,
    linkingUserId?: string
  ): Promise<OAuthIdentitySession>
}

const userRowSchema = z.object({
  id: z.string(),
})

const storeRowSchema = z.object({
  id: z.string(),
  onboarding_status: z.string(),
})

class OAuthIdentityStateError extends Error {
  readonly name = "OAuthIdentityStateError"
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

async function updateOAuthIdentity(
  queryable: Queryable,
  userId: string,
  profile: OAuthIdentityProfile,
  updatedAt: string
): Promise<void> {
  await queryable.execute(
    `UPDATE auth_identities
    SET
      user_id = ?,
      email = ?,
      display_name = ?,
      encrypted_access_token = ?,
      encrypted_refresh_token = COALESCE(?, encrypted_refresh_token),
      scopes_json = ?,
      expires_at = ?,
      updated_at = ?
    WHERE provider = ? AND provider_subject_id = ?`,
    [
      userId,
      normalizeEmail(profile),
      profile.displayName,
      encryptToken(profile.accessToken),
      profile.refreshToken === undefined
        ? null
        : encryptToken(profile.refreshToken),
      JSON.stringify(profile.scopes),
      profile.expiresAt ?? null,
      updatedAt,
      profile.provider,
      profile.subjectId,
    ]
  )
}

async function insertOAuthIdentity(
  queryable: Queryable,
  userId: string,
  profile: OAuthIdentityProfile,
  createdAt: string
): Promise<void> {
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
    ON CONFLICT(provider, provider_subject_id) DO NOTHING`,
    [
      stableId("auth", profile.provider, profile.subjectId),
      userId,
      profile.provider,
      profile.subjectId,
      normalizeEmail(profile),
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
    async upsertOAuthIdentity(profile, now = new Date(), linkingUserId) {
      const createdAt = now.toISOString()
      let result: OAuthIdentitySession | undefined

      await queryable.transaction(async (transaction) => {
        let userId = await findUserIdByProviderIdentity(transaction, profile)
        if (
          userId !== undefined &&
          linkingUserId !== undefined &&
          userId !== linkingUserId
        ) {
          throw new OAuthAccountLinkRequiredError(
            "This OAuth identity belongs to another account."
          )
        }
        if (userId === undefined) {
          const candidate = await findOrCreateOAuthUser(
            transaction,
            profile,
            normalizeEmail(profile),
            createdAt,
            linkingUserId
          )
          await insertOAuthIdentity(
            transaction,
            candidate.userId,
            profile,
            createdAt
          )
          userId = await findUserIdByProviderIdentity(transaction, profile)
          if (userId === undefined) {
            throw new OAuthIdentityStateError(
              "OAuth identity creation lost its unique identity."
            )
          }
          if (candidate.created && candidate.userId !== userId) {
            await transaction.execute("DELETE FROM users WHERE id = ?", [
              candidate.userId,
            ])
          }
        }

        await updateOAuthIdentity(transaction, userId, profile, createdAt)
        const store = await findOrCreatePrimaryStore(
          transaction,
          userId,
          createdAt
        )
        result = {
          onboardingComplete: store.onboarding_status === "COMPLETED",
          storeId: store.id,
          userId,
        }
      })

      if (result === undefined) {
        throw new OAuthIdentityStateError(
          "OAuth identity transaction completed without a session."
        )
      }
      return result
    },
  }
}
