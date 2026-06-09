import { NextResponse } from "next/server"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  demoStoreId,
  demoUserId,
  ensureDemoOwnerStore,
  getStoredSessionFromCookieValues,
  sessionCookieOptions,
} from "@/auth/session"

export async function POST() {
  ensureDemoOwnerStore()

  const session = getStoredSessionFromCookieValues({
    onboardingComplete: undefined,
    storeId: demoStoreId,
    userId: demoUserId,
  })
  const onboardingComplete = session?.onboardingComplete ?? false
  const response = new NextResponse(null, {
    headers: {
      Location: onboardingComplete ? "/app" : "/onboarding",
    },
    status: 303,
  })

  response.cookies.set(demoSessionCookieName, demoUserId, sessionCookieOptions)
  response.cookies.set(demoStoreCookieName, demoStoreId, sessionCookieOptions)

  return response
}
