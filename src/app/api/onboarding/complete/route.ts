import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import {
  demoSessionCookieName,
  isDemoSessionValid,
  onboardingCompleteCookieName,
  sessionCookieOptions,
} from "@/auth/session"

export async function POST(request: NextRequest) {
  const sessionCookie = request.cookies.get(demoSessionCookieName)?.value

  if (!isDemoSessionValid(sessionCookie)) {
    return new NextResponse(null, {
      headers: {
        Location: "/",
      },
      status: 303,
    })
  }

  const response = new NextResponse(null, {
    headers: {
      Location: "/app",
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
