import { applyMigrations, openDatabase, seedDemoData } from "@/server/db/sqlite"
import type { SqliteDatabase } from "@/server/db/sqlite"

export const demoSessionCookieName = "glocalx_demo_session"
export const demoStoreCookieName = "glocalx_demo_store"
export const authSessionCookieName = "glocalx_session"
export const onboardingCompleteCookieName = "glocalx_onboarding_complete"
export const sessionMaxAgeSeconds = 60 * 60 * 24 * 7

export const demoUserId = "demo-owner"
export const demoStoreId = "demo-store"

export type DemoSession = {
  readonly userId: string
  readonly storeId: string
  readonly onboardingComplete: boolean
}

export type SessionCookieValues = {
  readonly authSessionId?: string | undefined
  readonly onboardingComplete: string | undefined
  readonly storeId: string | undefined
  readonly userId: string | undefined
}

export const sessionCookieOptions = {
  // Session identifiers stay server-owned while remaining usable on local HTTP.
  httpOnly: true,
  maxAge: sessionMaxAgeSeconds,
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
} as const

function isProductionLikeEnvironment(
  env: Readonly<Record<string, string | undefined>>
): boolean {
  return (
    env["NODE_ENV"] === "production" ||
    env["VERCEL"] === "1" ||
    env["VERCEL_ENV"] === "preview" ||
    env["VERCEL_ENV"] === "production"
  )
}

export function allowsLegacyTestSessions(
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  return !isProductionLikeEnvironment(env) && env["PLAYWRIGHT_TEST"] === "true"
}

export function allowsDemoLogin(
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  return !isProductionLikeEnvironment(env) && env["PLAYWRIGHT_TEST"] === "true"
}

export function createDemoSession(onboardingComplete: boolean): DemoSession {
  return createSession(demoUserId, demoStoreId, onboardingComplete)
}

export function createSession(
  userId: string,
  storeId: string,
  onboardingComplete: boolean
): DemoSession {
  return {
    userId,
    storeId,
    onboardingComplete,
  }
}

export function isDemoSessionValid(sessionCookie: string | undefined): boolean {
  return sessionCookie === demoUserId
}

type SessionRow = {
  readonly count: number
}

type OnboardingStatusRow = {
  readonly onboarding_status: string
}

class LegacySqliteSessionHelperError extends Error {
  readonly name = "LegacySqliteSessionHelperError"
}

function assertLegacySqliteSessionHelperAllowed(): void {
  const provider = process.env["DATABASE_PROVIDER"]?.trim()
  const vercelEnv = process.env["VERCEL_ENV"]
  const isProductionLike =
    process.env["VERCEL"] === "1" ||
    vercelEnv === "preview" ||
    vercelEnv === "production"

  if (provider === "postgres" || isProductionLike) {
    throw new LegacySqliteSessionHelperError(
      "Legacy SQLite session helpers are local SQLite/test only."
    )
  }
}

export function isStoredSessionValid(
  database: SqliteDatabase,
  userId: string,
  storeId: string
): boolean {
  // Cookie pairs are only trusted after the store ownership row matches.
  const row = database
    .prepare(
      "SELECT COUNT(*) AS count FROM stores WHERE id = ? AND owner_user_id = ?"
    )
    .get(storeId, userId) as SessionRow | undefined
  return (row?.count ?? 0) > 0
}

function isStoreOnboardingComplete(
  database: SqliteDatabase,
  storeId: string
): boolean {
  const row = database
    .prepare("SELECT onboarding_status FROM stores WHERE id = ?")
    .get(storeId) as OnboardingStatusRow | undefined
  return row?.onboarding_status === "COMPLETED"
}

export function ensureLegacyDemoOwnerStore(): void {
  assertLegacySqliteSessionHelperAllowed()
  const database = openDatabase()
  applyMigrations(database)
  seedDemoData(database)
  database.close()
}

export function getLegacyStoredSessionFromCookieValues(
  values: SessionCookieValues
): DemoSession | undefined {
  const userId = values.userId?.trim()
  const storeId = values.storeId?.trim()
  if (!userId || !storeId) {
    return undefined
  }

  ensureLegacyDemoOwnerStore()
  const database = openDatabase()
  try {
    // The database, not the completion cookie, is the onboarding source of truth.
    if (!isStoredSessionValid(database, userId, storeId)) {
      return undefined
    }

    return createSession(
      userId,
      storeId,
      isStoreOnboardingComplete(database, storeId)
    )
  } finally {
    database.close()
  }
}

export function completeLegacyStoredSessionOnboarding(
  values: Pick<SessionCookieValues, "storeId" | "userId">
): boolean {
  const userId = values.userId?.trim()
  const storeId = values.storeId?.trim()
  if (!userId || !storeId) {
    return false
  }

  ensureLegacyDemoOwnerStore()
  const database = openDatabase()
  try {
    // Completion writes use the same owner/store check as session reads.
    if (!isStoredSessionValid(database, userId, storeId)) {
      return false
    }

    database
      .prepare("UPDATE stores SET onboarding_status = ? WHERE id = ?")
      .run("COMPLETED", storeId)
    return true
  } finally {
    database.close()
  }
}
