import { cookies } from "next/headers"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  onboardingCompleteCookieName,
} from "./session"
import type { DemoSession } from "./session"
import { openDatabaseContext } from "@/server/db"
import { createDatabaseSessionStore } from "@/server/repositories/session-store"

export async function getDemoSession(): Promise<DemoSession | undefined> {
  const cookieStore = await cookies()
  const databaseContext = await openDatabaseContext()

  try {
    return await createDatabaseSessionStore(
      databaseContext.queryable
    ).readSessionFromCookieValues({
      onboardingComplete: cookieStore.get(onboardingCompleteCookieName)?.value,
      storeId: cookieStore.get(demoStoreCookieName)?.value,
      userId: cookieStore.get(demoSessionCookieName)?.value,
    })
  } finally {
    await databaseContext.close()
  }
}
