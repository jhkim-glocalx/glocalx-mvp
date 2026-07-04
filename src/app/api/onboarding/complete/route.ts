import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  onboardingCompleteCookieName,
  sessionCookieOptions,
} from "@/auth/session"
import { withQueryableRouteDatabase } from "@/server/http"

export async function POST(request: NextRequest) {
  const sessionCookie = request.cookies.get(demoSessionCookieName)?.value
  const storeCookie = request.cookies.get(demoStoreCookieName)?.value

  return withQueryableRouteDatabase(async ({ sessionStore }) => {
    if (
      !(await sessionStore.completeOnboarding({
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
