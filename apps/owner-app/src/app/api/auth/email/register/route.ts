import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { createRegistrationRateLimitRules } from "@/auth/auth-rate-limit"
import { parseEmailRegistrationForm } from "@/auth/email-credentials"
import { hashPassword, PasswordWorkCapacityError } from "@/auth/email-password"
import { hasSameRequestOrigin } from "@/auth/request-origin"
import {
  rateLimitedResponse,
  redirectWithSession,
  withQueryableRouteDatabase,
} from "@/server/http"

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

  return withQueryableRouteDatabase(
    async ({
      authRateLimitRepository,
      emailCredentialsRepository,
      sessionStore,
    }) => {
      const rateLimitRules = createRegistrationRateLimitRules(
        request,
        registration.email
      )
      const accountRateLimitRule = rateLimitRules[0]
      const rateLimit = await authRateLimitRepository.consume(rateLimitRules)
      if (rateLimit.kind === "blocked") {
        return rateLimitedResponse(rateLimit.retryAfterSeconds)
      }
      let passwordHash: string
      try {
        passwordHash = await hashPassword(registration.password)
      } catch (error) {
        if (error instanceof PasswordWorkCapacityError) {
          return rateLimitedResponse(1)
        }
        throw error
      }
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
      await authRateLimitRepository.clear([accountRateLimitRule])
      return redirectWithSession(
        await sessionStore.createAuthenticatedSession(result.session)
      )
    }
  )
}
