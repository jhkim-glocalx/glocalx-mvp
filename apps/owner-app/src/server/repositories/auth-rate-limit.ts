import { z } from "zod"

import type { Queryable } from "@glocalx/db"

export type AuthRateLimitRule = {
  readonly id: string
  readonly maximumAttempts: number
  readonly windowSeconds: number
}

export type AuthRateLimitResult =
  | { readonly kind: "allowed" }
  | { readonly kind: "blocked"; readonly retryAfterSeconds: number }

export interface AuthRateLimitRepository {
  clear(rules: readonly AuthRateLimitRule[], now?: Date): Promise<void>
  consume(
    rules: readonly AuthRateLimitRule[],
    now?: Date
  ): Promise<AuthRateLimitResult>
}

const rateLimitRowSchema = z.object({
  attempt_count: z.number().int().positive(),
  expires_at_epoch: z.number().int().positive(),
})

class AuthRateLimitStateError extends Error {
  readonly name = "AuthRateLimitStateError"
}

function bucketId(rule: AuthRateLimitRule, nowEpoch: number): string {
  const bucketStart =
    Math.floor(nowEpoch / rule.windowSeconds) * rule.windowSeconds
  return `${rule.id}:${bucketStart}`
}

export function createDatabaseAuthRateLimitRepository(
  queryable: Queryable
): AuthRateLimitRepository {
  return {
    async clear(rules, now = new Date()) {
      const nowEpoch = Math.floor(now.getTime() / 1000)
      await queryable.transaction(async (transaction) => {
        for (const rule of rules) {
          await transaction.execute(
            "DELETE FROM auth_rate_limits WHERE id = ?",
            [bucketId(rule, nowEpoch)]
          )
        }
      })
    },

    async consume(rules, now = new Date()) {
      const nowEpoch = Math.floor(now.getTime() / 1000)
      let retryAfterSeconds = 0

      await queryable.transaction(async (transaction) => {
        await transaction.execute(
          "DELETE FROM auth_rate_limits WHERE expires_at_epoch <= ?",
          [nowEpoch]
        )

        for (const rule of rules) {
          const id = bucketId(rule, nowEpoch)
          const expiresAtEpoch =
            (Math.floor(nowEpoch / rule.windowSeconds) + 1) * rule.windowSeconds
          await transaction.execute(
            `INSERT INTO auth_rate_limits (id, attempt_count, expires_at_epoch)
            VALUES (?, 1, ?)
            ON CONFLICT(id) DO UPDATE SET
              attempt_count = auth_rate_limits.attempt_count + 1`,
            [id, expiresAtEpoch]
          )
          const row = rateLimitRowSchema.safeParse(
            await transaction.queryOne(
              "SELECT attempt_count, expires_at_epoch FROM auth_rate_limits WHERE id = ?",
              [id]
            )
          )
          if (!row.success) {
            throw new AuthRateLimitStateError(
              "Authentication rate limit update completed without state."
            )
          }
          if (row.data.attempt_count > rule.maximumAttempts) {
            retryAfterSeconds = Math.max(
              retryAfterSeconds,
              row.data.expires_at_epoch - nowEpoch
            )
          }
        }
      })

      return retryAfterSeconds > 0
        ? { kind: "blocked", retryAfterSeconds }
        : { kind: "allowed" }
    },
  }
}
