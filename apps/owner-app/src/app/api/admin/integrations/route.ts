import type { NextRequest } from "next/server"

import { getIntegrationRuntimeDiagnostics } from "@/integrations/runtime-diagnostics"
import {
  readDatabaseSession,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"

function isAdminDebugEnabled(): boolean {
  const value = process.env["ENABLE_ADMIN_DEBUG"]?.trim().toLowerCase()
  return value === "1" || value === "true"
}

export async function GET(request: NextRequest) {
  if (!isAdminDebugEnabled()) {
    return Response.json({ status: "NOT_FOUND" }, { status: 404 })
  }

  return withQueryableRouteDatabase(async ({ sessionStore }) => {
    const session = await readDatabaseSession(request, sessionStore)
    if (session === undefined) {
      return requiredSessionResponse()
    }

    return Response.json({
      status: "OK",
      integrations: getIntegrationRuntimeDiagnostics(process.env),
    })
  })
}
