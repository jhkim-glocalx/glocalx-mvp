import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { hasSameRequestOrigin } from "@/auth/request-origin"
import {
  adminSessionCookieName,
  adminSessionCookieOptions,
} from "@/auth/session"
import { createAdminAuthStore } from "@/server/admin-auth-store"
import { openDatabaseContext } from "@glocalx/db"
import {
  PasswordWorkCapacityError,
  passwordVerificationDecoyHash,
  verifyPassword,
} from "@glocalx/domain/password-hash"

function loginRedirect(error: string): NextResponse {
  return new NextResponse(null, {
    headers: { Location: `/login?auth_error=${error}` },
    status: 303,
  })
}

export async function POST(request: NextRequest) {
  if (!hasSameRequestOrigin(request)) {
    return loginRedirect("invalid_request")
  }

  const form = await request.formData()
  const email = form.get("email")
  const password = form.get("password")
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    email.trim() === "" ||
    password === ""
  ) {
    return loginRedirect("invalid_input")
  }

  const databaseContext = await openDatabaseContext()
  try {
    const store = createAdminAuthStore(databaseContext.queryable)
    const credential = await store.readCredentialByEmail(email)
    let passwordMatches: boolean
    try {
      // Verify against a decoy hash when the account is unknown so response
      // timing does not reveal which admin emails exist.
      passwordMatches = await verifyPassword(
        password,
        credential?.passwordHash ?? passwordVerificationDecoyHash
      )
    } catch (error) {
      if (error instanceof PasswordWorkCapacityError) {
        return loginRedirect("try_again")
      }
      throw error
    }
    if (!passwordMatches || credential === undefined) {
      return loginRedirect("invalid_credentials")
    }

    const sessionId = await store.createSession(credential.adminUserId)
    const response = new NextResponse(null, {
      headers: { Location: "/stores" },
      status: 303,
    })
    response.cookies.set(
      adminSessionCookieName,
      sessionId,
      adminSessionCookieOptions
    )
    return response
  } finally {
    await databaseContext.close()
  }
}
