import { applyMigrations, openDatabase, seedDemoData } from "@/server/db/sqlite"
import type { SqliteDatabase } from "@/server/db/sqlite"

export const demoSessionCookieName = "glocalx_demo_session"
export const demoStoreCookieName = "glocalx_demo_store"
export const onboardingCompleteCookieName = "glocalx_onboarding_complete"

export const demoUserId = "demo-owner"
export const demoStoreId = "demo-store"

export type DemoSession = {
  readonly userId: string
  readonly storeId: string
  readonly onboardingComplete: boolean
}

export type SessionCookieValues = {
  readonly onboardingComplete: string | undefined
  readonly storeId: string | undefined
  readonly userId: string | undefined
}

export const sessionCookieOptions = {
  httpOnly: true,
  maxAge: 60 * 60 * 24 * 7,
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
} as const

export function ensureDemoOwnerStore(): void {
  const database = openDatabase()
  applyMigrations(database)
  seedDemoData(database)
  database.close()
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

export function isStoredSessionValid(
  database: SqliteDatabase,
  userId: string,
  storeId: string
): boolean {
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

export function getStoredSessionFromCookieValues(
  values: SessionCookieValues
): DemoSession | undefined {
  const userId = values.userId?.trim()
  const storeId = values.storeId?.trim()
  if (!userId || !storeId) {
    return undefined
  }

  ensureDemoOwnerStore()
  const database = openDatabase()
  try {
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

export function completeStoredSessionOnboarding(
  values: Pick<SessionCookieValues, "storeId" | "userId">
): boolean {
  const userId = values.userId?.trim()
  const storeId = values.storeId?.trim()
  if (!userId || !storeId) {
    return false
  }

  ensureDemoOwnerStore()
  const database = openDatabase()
  try {
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
