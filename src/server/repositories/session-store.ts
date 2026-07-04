import type { DemoSession, SessionCookieValues } from "@/auth/session"

export interface SessionStore {
  createSession(options: {
    readonly onboardingComplete: boolean
    readonly storeId: string
    readonly userId: string
  }): DemoSession
  readSessionFromCookieValues(
    values: SessionCookieValues
  ): DemoSession | undefined
  completeOnboarding(values: {
    readonly storeId: string | undefined
    readonly userId: string | undefined
  }): boolean
  isValidStoreOwner(options: {
    readonly storeId: string
    readonly userId: string
  }): boolean
}
