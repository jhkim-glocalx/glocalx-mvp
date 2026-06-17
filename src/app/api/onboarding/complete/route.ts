import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import {
  completeStoredSessionOnboarding,
  demoSessionCookieName,
  demoStoreCookieName,
  onboardingCompleteCookieName,
  sessionCookieOptions,
} from "@/auth/session"

export async function POST(request: NextRequest) {
  const sessionCookie = request.cookies.get(demoSessionCookieName)?.value
  const storeCookie = request.cookies.get(demoStoreCookieName)?.value

  if (
    !completeStoredSessionOnboarding({
      storeId: storeCookie,
      userId: sessionCookie,
    })
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
}
