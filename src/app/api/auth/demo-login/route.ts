import { NextResponse } from "next/server"

import {
  allowsDemoLogin,
  authSessionCookieName,
  demoStoreId,
  demoUserId,
  sessionCookieOptions,
} from "@/auth/session"
import { withQueryableRouteDatabase } from "@/server/http"

export async function POST() {
  if (!allowsDemoLogin()) {
    return new NextResponse(null, { status: 404 })
  }

  return withQueryableRouteDatabase(async ({ sessionStore }) => {
    const session = await sessionStore.readSessionFromCookieValues({
      onboardingComplete: undefined,
      storeId: demoStoreId,
      userId: demoUserId,
    })
    if (session === undefined) {
      return new NextResponse(null, { status: 404 })
    }

    const authenticatedSession =
      await sessionStore.createAuthenticatedSession(session)
    const response = new NextResponse(null, {
      headers: {
        Location: session.onboardingComplete ? "/app" : "/onboarding",
      },
      status: 303,
    })

    response.cookies.set(
      authSessionCookieName,
      authenticatedSession.sessionId,
      sessionCookieOptions
    )

    return response
  })
}
