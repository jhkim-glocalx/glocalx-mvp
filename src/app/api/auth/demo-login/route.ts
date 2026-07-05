import { NextResponse } from "next/server"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  demoStoreId,
  demoUserId,
  sessionCookieOptions,
} from "@/auth/session"
import { withQueryableRouteDatabase } from "@/server/http"

export async function POST() {
  return withQueryableRouteDatabase(async ({ sessionStore }) => {
    const session = await sessionStore.readSessionFromCookieValues({
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

    response.cookies.set(
      demoSessionCookieName,
      demoUserId,
      sessionCookieOptions
    )
    response.cookies.set(demoStoreCookieName, demoStoreId, sessionCookieOptions)

    return response
  })
}
