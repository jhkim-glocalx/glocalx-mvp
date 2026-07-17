import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { createLoginRateLimitRules } from "@/auth/auth-rate-limit"
import { parseEmailLoginForm } from "@/auth/email-credentials"
import {
  PasswordWorkCapacityError,
  passwordVerificationDecoyHash,
  verifyPassword,
} from "@/auth/email-password"
import { hasSameRequestOrigin } from "@/auth/request-origin"
import {
  rateLimitedResponse,
  redirectWithSession,
  withQueryableRouteDatabase,
} from "@/server/http"

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
    async ({
      authRateLimitRepository,
      emailCredentialsRepository,
      sessionStore,
    }) => {
      const rateLimitRules = createLoginRateLimitRules(request, login.email)
      const accountRateLimitRule = rateLimitRules[0]
      const rateLimit = await authRateLimitRepository.consume(rateLimitRules)
      if (rateLimit.kind === "blocked") {
        return rateLimitedResponse(rateLimit.retryAfterSeconds)
      }
      const credential = await emailCredentialsRepository.readCredential(
        login.email
      )
      let passwordMatches: boolean
      try {
        passwordMatches = await verifyPassword(
          login.password,
          credential?.passwordHash ?? passwordVerificationDecoyHash
        )
      } catch (error) {
        if (error instanceof PasswordWorkCapacityError) {
          return rateLimitedResponse(1)
        }
        throw error
      }
      if (!passwordMatches || credential === undefined) {
        return new NextResponse(null, {
          headers: { Location: "/login?auth_error=invalid_credentials" },
          status: 303,
        })
      }
      await authRateLimitRepository.clear([accountRateLimitRule])
      return redirectWithSession(
        await sessionStore.createAuthenticatedSession(credential.session)
      )
    }
  )
}
