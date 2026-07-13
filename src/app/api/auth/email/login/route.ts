import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { parseEmailLoginForm } from "@/auth/email-credentials"
import {
  passwordVerificationDecoyHash,
  verifyPassword,
} from "@/auth/email-password"
import { hasSameRequestOrigin } from "@/auth/request-origin"
import { authSessionCookieName, sessionCookieOptions } from "@/auth/session"
import { withQueryableRouteDatabase } from "@/server/http"
import type { AuthenticatedSession } from "@/server/repositories/session-store"

function redirectWithSession({
  session,
  sessionId,
}: AuthenticatedSession): NextResponse {
  const response = new NextResponse(null, {
    headers: {
      Location: session.onboardingComplete ? "/app" : "/onboarding",
    },
    status: 303,
  })
  response.cookies.set(authSessionCookieName, sessionId, sessionCookieOptions)
  return response
}

export async function POST(request: NextRequest) {
  if (!hasSameRequestOrigin(request)) {
    return new NextResponse(null, {
      headers: { Location: "/login?auth_error=invalid_request" },
      status: 303,
    })
  }

  const login = parseEmailLoginForm(await request.formData())
  if (login === undefined) {
    return new NextResponse(null, {
      headers: { Location: "/login?auth_error=invalid_input" },
      status: 303,
    })
  }

  return withQueryableRouteDatabase(
    async ({ emailCredentialsRepository, sessionStore }) => {
      const credential = await emailCredentialsRepository.readCredential(
        login.email
      )
      const passwordMatches = await verifyPassword(
        login.password,
        credential?.passwordHash ?? passwordVerificationDecoyHash
      )
      if (!passwordMatches || credential === undefined) {
        return new NextResponse(null, {
          headers: { Location: "/login?auth_error=invalid_credentials" },
          status: 303,
        })
      }
      return redirectWithSession(
        await sessionStore.createAuthenticatedSession(credential.session)
      )
    }
  )
}
