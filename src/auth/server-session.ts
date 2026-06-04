import { cookies } from "next/headers"

import {
  createDemoSession,
  demoSessionCookieName,
  demoStoreCookieName,
  demoStoreId,
  isDemoSessionValid,
  onboardingCompleteCookieName,
} from "./session"
import type { DemoSession } from "./session"

export async function getDemoSession(): Promise<DemoSession | undefined> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(demoSessionCookieName)?.value
  const storeCookie = cookieStore.get(demoStoreCookieName)?.value

  if (!isDemoSessionValid(sessionCookie) || storeCookie !== demoStoreId) {
    return undefined
  }

  return createDemoSession(
    cookieStore.get(onboardingCompleteCookieName)?.value === "true"
  )
}
