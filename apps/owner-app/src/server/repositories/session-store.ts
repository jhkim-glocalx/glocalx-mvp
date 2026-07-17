import { randomBytes } from "node:crypto"

import {
  allowsLegacyTestSessions,
  createSession,
  sessionMaxAgeSeconds,
} from "@/auth/session"
import type { DemoSession, SessionCookieValues } from "@/auth/session"
import type { Queryable } from "@glocalx/db"
import { z } from "zod"

export interface SessionStore {
  createAuthenticatedSession(options: {
    readonly onboardingComplete: boolean
    readonly storeId: string
    readonly userId: string
  }): Promise<AuthenticatedSession>
  createSession(options: {
    readonly onboardingComplete: boolean
    readonly storeId: string
    readonly userId: string
  }): DemoSession
  readSessionFromCookieValues(
    values: SessionCookieValues
  ): Promise<DemoSession | undefined>
  completeOnboarding(values: {
    readonly authSessionId?: string | undefined
    readonly storeId: string | undefined
    readonly userId: string | undefined
  }): Promise<boolean>
  isValidStoreOwner(options: {
    readonly storeId: string
    readonly userId: string
  }): Promise<boolean>
}

export type AuthenticatedSession = {
  readonly session: DemoSession
  readonly sessionId: string
}

const onboardingStatusSchema = z.enum([
  "COMPLETED",
  "IN_PROGRESS",
  "NOT_STARTED",
])

const sessionRowSchema = z.object({
  onboarding_status: onboardingStatusSchema,
  store_id: z.string(),
  user_id: z.string(),
})

type OnboardingStatus = z.infer<typeof onboardingStatusSchema>

function readCookieIdentifier(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim()
  if (!trimmedValue) {
    return undefined
  }

  return trimmedValue
}

function createRepositorySession(options: {
  readonly onboardingComplete: boolean
  readonly storeId: string
  readonly userId: string
}): DemoSession {
  return createSession(
    options.userId,
    options.storeId,
    options.onboardingComplete
  )
}

function isOnboardingComplete(status: OnboardingStatus): boolean {
  return status === "COMPLETED"
}

function createSessionExpiry(now: Date): string {
  return new Date(now.getTime() + sessionMaxAgeSeconds * 1000).toISOString()
}

function createSessionId(): string {
  return randomBytes(32).toString("base64url")
}

function sessionFromRow(row: z.infer<typeof sessionRowSchema>): DemoSession {
  return createRepositorySession({
    onboardingComplete: isOnboardingComplete(row.onboarding_status),
    storeId: row.store_id,
    userId: row.user_id,
  })
}

export function createDatabaseSessionStore(queryable: Queryable): SessionStore {
  return {
    async createAuthenticatedSession(options) {
      const now = new Date()
      const sessionId = createSessionId()
      await queryable.execute(
        "DELETE FROM user_sessions WHERE expires_at <= ?",
        [now.toISOString()]
      )
      const result = await queryable.execute(
        `INSERT INTO user_sessions (
          id,
          user_id,
          store_id,
          expires_at,
          created_at
        )
        SELECT ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1
          FROM stores
          WHERE id = ? AND owner_user_id = ?
        )`,
        [
          sessionId,
          options.userId,
          options.storeId,
          createSessionExpiry(now),
          now.toISOString(),
          options.storeId,
          options.userId,
        ]
      )
      if (result.changes === 0) {
        throw new Error("Cannot create a session for an unowned store.")
      }

      return {
        session: createRepositorySession(options),
        sessionId,
      }
    },

    async completeOnboarding(values) {
      const authSessionId = readCookieIdentifier(values.authSessionId)
      if (authSessionId !== undefined) {
        const result = await queryable.execute(
          `UPDATE stores
          SET onboarding_status = ?
          WHERE EXISTS (
            SELECT 1
            FROM user_sessions
            WHERE user_sessions.id = ?
              AND user_sessions.expires_at > ?
              AND user_sessions.store_id = stores.id
              AND user_sessions.user_id = stores.owner_user_id
          )`,
          ["COMPLETED", authSessionId, new Date().toISOString()]
        )
        return result.changes > 0
      }

      if (!allowsLegacyTestSessions()) {
        return false
      }

      const userId = readCookieIdentifier(values.userId)
      const storeId = readCookieIdentifier(values.storeId)
      if (!userId || !storeId) {
        return false
      }

      const result = await queryable.execute(
        "UPDATE stores SET onboarding_status = ? WHERE id = ? AND owner_user_id = ?",
        ["COMPLETED", storeId, userId]
      )
      return result.changes > 0
    },

    createSession: createRepositorySession,

    async isValidStoreOwner(options) {
      const row = await queryable.queryOne(
        "SELECT onboarding_status FROM stores WHERE id = ? AND owner_user_id = ?",
        [options.storeId, options.userId]
      )
      return row !== undefined
    },

    async readSessionFromCookieValues(values) {
      const authSessionId = readCookieIdentifier(values.authSessionId)
      if (authSessionId !== undefined) {
        const row = sessionRowSchema.safeParse(
          await queryable.queryOne(
            `SELECT
              user_sessions.user_id,
              user_sessions.store_id,
              stores.onboarding_status
            FROM user_sessions
            JOIN stores ON stores.id = user_sessions.store_id
            WHERE user_sessions.id = ?
              AND user_sessions.expires_at > ?
              AND stores.owner_user_id = user_sessions.user_id`,
            [authSessionId, new Date().toISOString()]
          )
        )
        return row.success ? sessionFromRow(row.data) : undefined
      }

      if (!allowsLegacyTestSessions()) {
        return undefined
      }

      const userId = readCookieIdentifier(values.userId)
      const storeId = readCookieIdentifier(values.storeId)
      if (!userId || !storeId) {
        return undefined
      }

      const row = sessionRowSchema.safeParse(
        await queryable.queryOne(
          "SELECT id AS store_id, owner_user_id AS user_id, onboarding_status FROM stores WHERE id = ? AND owner_user_id = ?",
          [storeId, userId]
        )
      )
      if (!row.success) {
        return undefined
      }
      return sessionFromRow(row.data)
    },
  }
}
