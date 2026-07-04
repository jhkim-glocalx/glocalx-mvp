import { createSession } from "@/auth/session"
import type { DemoSession, SessionCookieValues } from "@/auth/session"
import type { Queryable } from "@/server/db"
import { z } from "zod"

export interface SessionStore {
  createSession(options: {
    readonly onboardingComplete: boolean
    readonly storeId: string
    readonly userId: string
  }): DemoSession
  readSessionFromCookieValues(
    values: SessionCookieValues
  ): Promise<DemoSession | undefined>
  completeOnboarding(values: {
    readonly storeId: string | undefined
    readonly userId: string | undefined
  }): Promise<boolean>
  isValidStoreOwner(options: {
    readonly storeId: string
    readonly userId: string
  }): Promise<boolean>
}

const onboardingStatusSchema = z.enum([
  "COMPLETED",
  "IN_PROGRESS",
  "NOT_STARTED",
])

const sessionRowSchema = z.object({
  onboarding_status: onboardingStatusSchema,
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

export function createDatabaseSessionStore(queryable: Queryable): SessionStore {
  return {
    async completeOnboarding(values) {
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
      const userId = readCookieIdentifier(values.userId)
      const storeId = readCookieIdentifier(values.storeId)
      if (!userId || !storeId) {
        return undefined
      }

      const row = await queryable.queryOne(
        "SELECT onboarding_status FROM stores WHERE id = ? AND owner_user_id = ?",
        [storeId, userId]
      )
      if (row === undefined) {
        return undefined
      }

      const sessionRow = sessionRowSchema.parse(row)
      return createRepositorySession({
        onboardingComplete: isOnboardingComplete(sessionRow.onboarding_status),
        storeId,
        userId,
      })
    },
  }
}
