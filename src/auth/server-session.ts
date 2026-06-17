import { cookies } from "next/headers"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  getStoredSessionFromCookieValues,
  onboardingCompleteCookieName,
} from "./session"
import type { DemoSession } from "./session"

export async function getDemoSession(): Promise<DemoSession | undefined> {
  // Next exposes cookies() asynchronously; session.ts still revalidates IDs.
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(demoSessionCookieName)?.value
  const storeCookie = cookieStore.get(demoStoreCookieName)?.value

  return getStoredSessionFromCookieValues({
    onboardingComplete: cookieStore.get(onboardingCompleteCookieName)?.value,
    storeId: storeCookie,
    userId: sessionCookie,
  })
}
