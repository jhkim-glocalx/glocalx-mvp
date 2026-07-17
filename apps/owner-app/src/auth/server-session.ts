import { cookies } from "next/headers"

import {
  allowsLegacyTestSessions,
  authSessionCookieName,
  demoSessionCookieName,
  demoStoreCookieName,
  onboardingCompleteCookieName,
} from "./session"
import type { DemoSession } from "./session"
import { openDatabaseContext } from "@glocalx/db"
import { createDatabaseSessionStore } from "@/server/repositories/session-store"

export async function getDemoSession(): Promise<DemoSession | undefined> {
  const cookieStore = await cookies()
  const databaseContext = await openDatabaseContext()
  const readLegacyCookies = allowsLegacyTestSessions()

  try {
    return await createDatabaseSessionStore(
      databaseContext.queryable
    ).readSessionFromCookieValues({
      authSessionId: cookieStore.get(authSessionCookieName)?.value,
      onboardingComplete: cookieStore.get(onboardingCompleteCookieName)?.value,
      storeId: readLegacyCookies
        ? cookieStore.get(demoStoreCookieName)?.value
        : undefined,
      userId: readLegacyCookies
        ? cookieStore.get(demoSessionCookieName)?.value
        : undefined,
    })
  } finally {
    await databaseContext.close()
  }
}
