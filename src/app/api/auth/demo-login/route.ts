import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  demoStoreId,
  demoUserId,
  ensureDemoOwnerStore,
  onboardingCompleteCookieName,
  sessionCookieOptions,
} from "@/auth/session"

export async function POST(request: NextRequest) {
  ensureDemoOwnerStore()

  const onboardingComplete =
    request.cookies.get(onboardingCompleteCookieName)?.value === "true"
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
