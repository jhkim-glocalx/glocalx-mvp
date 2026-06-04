import { applyMigrations, openDatabase, seedDemoData } from "@/server/db/sqlite"

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

export const sessionCookieOptions = {
  httpOnly: true,
  maxAge: 60 * 60 * 24 * 7,
  path: "/",
  sameSite: "lax",
} as const

export function ensureDemoOwnerStore(): void {
  const database = openDatabase()
  applyMigrations(database)
  seedDemoData(database)
  database.close()
}

export function createDemoSession(onboardingComplete: boolean): DemoSession {
  return {
    userId: demoUserId,
    storeId: demoStoreId,
    onboardingComplete,
  }
}

export function isDemoSessionValid(sessionCookie: string | undefined): boolean {
  return sessionCookie === demoUserId
}
