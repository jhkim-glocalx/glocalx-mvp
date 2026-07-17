import { randomUUID } from "node:crypto"

import type { DemoSession } from "@/auth/session"
import type { Queryable } from "@/server/db"
import { z } from "zod"

export type EmailCredential = {
  readonly passwordHash: string
  readonly session: DemoSession
}

export type EmailRegistrationResult =
  | {
      readonly kind: "email_taken"
    }
  | {
      readonly kind: "registered"
      readonly session: DemoSession
    }

export interface EmailCredentialsRepository {
  readCredential(email: string): Promise<EmailCredential | undefined>
  register(options: {
    readonly displayName: string
    readonly email: string
    readonly passwordHash: string
  }): Promise<EmailRegistrationResult>
}

const credentialRowSchema = z.object({
  onboarding_status: z.string(),
  password_hash: z.string().min(1),
  store_id: z.string(),
  user_id: z.string(),
})

class EmailRegistrationStateError extends Error {
  readonly name = "EmailRegistrationStateError"
}

function toSession(row: z.infer<typeof credentialRowSchema>): DemoSession {
  return {
    onboardingComplete: row.onboarding_status === "COMPLETED",
    storeId: row.store_id,
    userId: row.user_id,
  }
}

export function createDatabaseEmailCredentialsRepository(
  queryable: Queryable
): EmailCredentialsRepository {
  return {
    async readCredential(email) {
      const row = credentialRowSchema.safeParse(
        await queryable.queryOne(
          `SELECT
            users.id AS user_id,
            stores.id AS store_id,
            stores.onboarding_status,
            email_credentials.password_hash
          FROM users
          JOIN email_credentials ON email_credentials.user_id = users.id
          JOIN stores ON stores.owner_user_id = users.id
          WHERE users.email = ?
          ORDER BY stores.created_at ASC
          LIMIT 1`,
          [email]
        )
      )
      if (!row.success) {
        return undefined
      }

      return {
        passwordHash: row.data.password_hash,
        session: toSession(row.data),
      }
    },

    async register(options) {
      const createdAt = new Date().toISOString()
      const userId = randomUUID()
      const storeId = randomUUID()
      let result: EmailRegistrationResult | undefined

      await queryable.transaction(async (transaction) => {
        const userInsert = await transaction.execute(
          "INSERT INTO users (id, email, display_name, role, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING",
          [userId, options.email, options.displayName, "OWNER", createdAt]
        )
        if (userInsert.changes === 0) {
          result = { kind: "email_taken" }
          return
        }

        await transaction.execute(
          "INSERT INTO email_credentials (user_id, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)",
          [userId, options.passwordHash, createdAt, createdAt]
        )
        await transaction.execute(
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
        result = {
          kind: "registered",
          session: {
            onboardingComplete: false,
            storeId,
            userId,
          },
        }
      })

      if (result === undefined) {
        throw new EmailRegistrationStateError(
          "Email account registration completed without a result."
        )
      }
      return result
    },
  }
}
