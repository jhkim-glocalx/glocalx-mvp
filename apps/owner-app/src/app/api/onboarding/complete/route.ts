import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import {
  allowsLegacyTestSessions,
  authSessionCookieName,
  demoSessionCookieName,
  demoStoreCookieName,
  onboardingCompleteCookieName,
  sessionCookieOptions,
} from "@/auth/session"
import { withQueryableRouteDatabase } from "@/server/http"

export async function POST(request: NextRequest) {
  const readLegacyCookies = allowsLegacyTestSessions()
  const authSessionCookie = request.cookies.get(authSessionCookieName)?.value
  const sessionCookie = readLegacyCookies
    ? request.cookies.get(demoSessionCookieName)?.value
    : undefined
  const storeCookie = readLegacyCookies
    ? request.cookies.get(demoStoreCookieName)?.value
    : undefined

  return withQueryableRouteDatabase(async ({ sessionStore }) => {
    if (
      !(await sessionStore.completeOnboarding({
        authSessionId: authSessionCookie,
        storeId: storeCookie,
        userId: sessionCookie,
      }))
    ) {
      return new NextResponse(null, {
        headers: {
          Location: "/",
        },
        status: 303,
      })
    }

    const response = new NextResponse(null, {
      headers: {
        Location: "/app?nav=photo",
      },
      status: 303,
    })
    response.cookies.set(
      onboardingCompleteCookieName,
      "true",
      sessionCookieOptions
    )
    return response
  })
}
