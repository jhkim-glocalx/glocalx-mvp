import type { NextRequest } from "next/server"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  getStoredSessionFromCookieValues,
  onboardingCompleteCookieName,
} from "@/auth/session"
import { getIntegrationRuntimeDiagnostics } from "@/integrations/runtime-diagnostics"

function isAdminDebugEnabled(): boolean {
  const value = process.env["ENABLE_ADMIN_DEBUG"]?.trim().toLowerCase()
  return value === "1" || value === "true"
}

function hasDemoSession(request: NextRequest): boolean {
  return (
    getStoredSessionFromCookieValues({
      onboardingComplete: request.cookies.get(onboardingCompleteCookieName)
        ?.value,
      storeId: request.cookies.get(demoStoreCookieName)?.value,
      userId: request.cookies.get(demoSessionCookieName)?.value,
    }) !== undefined
  )
}

export async function GET(request: NextRequest) {
  if (!isAdminDebugEnabled()) {
    return Response.json({ status: "NOT_FOUND" }, { status: 404 })
  }

  if (!hasDemoSession(request)) {
    return Response.json(
      {
        status: "AUTH_REQUIRED",
        message: "로그인이 필요합니다.",
      },
      { status: 401 }
    )
  }

  return Response.json({
    status: "OK",
    integrations: getIntegrationRuntimeDiagnostics(process.env),
  })
}
