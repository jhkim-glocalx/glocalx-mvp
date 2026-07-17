import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { hasSameRequestOrigin } from "@/auth/request-origin"
import {
  adminSessionCookieName,
  adminSessionCookieOptions,
} from "@/auth/session"
import { createAdminAuthStore } from "@/server/admin-auth-store"
import { openDatabaseContext } from "@glocalx/db"

export async function POST(request: NextRequest) {
  if (!hasSameRequestOrigin(request)) {
    return new NextResponse(null, {
      headers: { Location: "/login" },
      status: 303,
    })
  }

  const sessionId = request.cookies.get(adminSessionCookieName)?.value
  const databaseContext = await openDatabaseContext()
  try {
    await createAdminAuthStore(databaseContext.queryable).deleteSession(
      sessionId
    )
  } finally {
    await databaseContext.close()
  }

  const response = new NextResponse(null, {
    headers: { Location: "/login" },
    status: 303,
  })
  response.cookies.set(adminSessionCookieName, "", {
    ...adminSessionCookieOptions,
    maxAge: 0,
  })
  return response
}
