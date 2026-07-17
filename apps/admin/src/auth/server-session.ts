import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { adminSessionCookieName } from "./session"
import type { AdminSession } from "./session"
import { createAdminAuthStore } from "@/server/admin-auth-store"
import { openDatabaseContext } from "@glocalx/db"

export async function getAdminSession(): Promise<AdminSession | undefined> {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(adminSessionCookieName)?.value
  if (!sessionId) {
    return undefined
  }

  const databaseContext = await openDatabaseContext()
  try {
    return await createAdminAuthStore(databaseContext.queryable).readSession(
      sessionId
    )
  } finally {
    await databaseContext.close()
  }
}

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession()
  if (session === undefined) {
    redirect("/login")
  }
  return session
}
