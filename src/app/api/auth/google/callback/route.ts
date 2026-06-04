import type { NextRequest } from "next/server"

import { ensureDemoOwnerStore } from "@/auth/session"
import { handleGoogleOAuthCallback } from "@/gbp/oauth-callback"
import { openDatabase } from "@/server/db/sqlite"

const demoGoogleOAuthState = "demo-store:google-oauth-state"

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") ?? ""
  const state = request.nextUrl.searchParams.get("state") ?? ""

  ensureDemoOwnerStore()
  const database = openDatabase()

  try {
    const result = handleGoogleOAuthCallback({
      code,
      database,
      expectedState: demoGoogleOAuthState,
      state,
      storeId: "demo-store",
    })

    return Response.json(result, {
      status: result.status === "INVALID_OAUTH_STATE" ? 400 : 200,
    })
  } finally {
    database.close()
  }
}
