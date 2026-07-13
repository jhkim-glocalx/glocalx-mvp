import { randomUUID } from "node:crypto"

import type { OAuthIdentityProfile } from "@/auth/oauth-identity"
import type { Queryable } from "@/server/db"
import { z } from "zod"

const emailOwnerRowSchema = z.object({
  has_email_credential: z.number().int().min(0).max(1),
  id: z.string(),
})

export type OAuthUserCandidate = {
  readonly created: boolean
  readonly userId: string
}

export class OAuthAccountLinkRequiredError extends Error {
  readonly name = "OAuthAccountLinkRequiredError"
}

class OAuthAccountOwnerStateError extends Error {
  readonly name = "OAuthAccountOwnerStateError"
}

export async function findOrCreateOAuthUser(
  queryable: Queryable,
  profile: OAuthIdentityProfile,
  email: string,
  createdAt: string,
  linkingUserId: string | undefined
): Promise<OAuthUserCandidate> {
  const readEmailOwner = async () =>
    emailOwnerRowSchema.safeParse(
      await queryable.queryOne(
        `SELECT
          users.id,
          CASE WHEN email_credentials.user_id IS NULL THEN 0 ELSE 1 END AS has_email_credential
        FROM users
        LEFT JOIN email_credentials ON email_credentials.user_id = users.id
        WHERE users.email = ?`,
        [email]
      )
    )
  const resolveEmailOwner = (
    owner: z.infer<typeof emailOwnerRowSchema>
  ): OAuthUserCandidate => {
    if (owner.has_email_credential === 1 && linkingUserId !== owner.id) {
      throw new OAuthAccountLinkRequiredError(
        "Sign in with the existing email account before linking OAuth."
      )
    }
    return { created: false, userId: owner.id }
  }
  const existingOwner = await readEmailOwner()
  if (existingOwner.success) {
    return resolveEmailOwner(existingOwner.data)
  }

  const candidateUserId = randomUUID()
  const insert = await queryable.execute(
    "INSERT INTO users (id, email, display_name, role, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING",
    [candidateUserId, email, profile.displayName, "OWNER", createdAt]
  )
  if (insert.changes > 0) {
    return { created: true, userId: candidateUserId }
  }

  const concurrentOwner = await readEmailOwner()
  if (!concurrentOwner.success) {
    throw new OAuthAccountOwnerStateError(
      "OAuth user creation completed without an email owner."
    )
  }
  return resolveEmailOwner(concurrentOwner.data)
}
