import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { parseEmailRegistrationForm } from "@/auth/email-credentials"
import { hashPassword } from "@/auth/email-password"
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
      headers: { Location: "/register?auth_error=invalid_request" },
      status: 303,
    })
  }

  const registration = parseEmailRegistrationForm(await request.formData())
  if (registration === undefined) {
    return new NextResponse(null, {
      headers: { Location: "/register?auth_error=invalid_input" },
      status: 303,
    })
  }

  const passwordHash = await hashPassword(registration.password)
  return withQueryableRouteDatabase(
    async ({ emailCredentialsRepository, sessionStore }) => {
      const result = await emailCredentialsRepository.register({
        displayName: registration.displayName,
        email: registration.email,
        passwordHash,
      })
      if (result.kind === "email_taken") {
        return new NextResponse(null, {
          headers: {
            Location: "/register?auth_error=registration_unavailable",
          },
          status: 303,
        })
      }
      return redirectWithSession(
        await sessionStore.createAuthenticatedSession(result.session)
      )
    }
  )
}
