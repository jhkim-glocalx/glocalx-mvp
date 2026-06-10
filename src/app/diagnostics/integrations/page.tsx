import { cookies } from "next/headers"

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

function payloadJson(payload: unknown): string {
  return JSON.stringify(payload, null, 2)
}

export default async function IntegrationDiagnosticsPage() {
  const cookieStore = await cookies()
  const session = getStoredSessionFromCookieValues({
    onboardingComplete: cookieStore.get(onboardingCompleteCookieName)?.value,
    storeId: cookieStore.get(demoStoreCookieName)?.value,
    userId: cookieStore.get(demoSessionCookieName)?.value,
  })

  const payload = !isAdminDebugEnabled()
    ? { status: "NOT_FOUND" }
    : session === undefined
      ? { status: "AUTH_REQUIRED", message: "로그인이 필요합니다." }
      : {
          status: "OK",
          integrations: getIntegrationRuntimeDiagnostics(process.env),
        }

  return (
    <main className="min-h-screen bg-white p-6 text-sm text-[var(--ink)]">
      <pre className="whitespace-pre-wrap break-words">
        {payloadJson(payload)}
      </pre>
    </main>
  )
}
