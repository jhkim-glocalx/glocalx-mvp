import type { NextRequest } from "next/server"

import { gbpSetupRequestSchema } from "@glocalx/domain"
import {
  parseJsonRoutePayload,
  readDatabaseSession,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"

// GBP submission is now an admin-only action (the Stores console's "제출
// 대기" section runs setupGoogleBusinessProfile on the operator's behalf,
// via apps/admin's own route) — this endpoint no longer calls Google at all,
// so a direct request here cannot create a listing the operator never
// reviewed. It still requires a session so it doesn't leak whether a store
// id exists to an unauthenticated caller.
export async function POST(request: NextRequest) {
  const parsed = await parseJsonRoutePayload(request, gbpSetupRequestSchema)
  if (parsed.kind === "response") {
    return parsed.response
  }

  return withQueryableRouteDatabase(async ({ sessionStore }) => {
    const session = await readDatabaseSession(request, sessionStore)
    if (session === undefined) {
      return requiredSessionResponse()
    }

    return Response.json({
      status: "PENDING_ADMIN_REVIEW",
      message: "운영자가 확인 후 Google 비즈니스 프로필을 등록해드립니다.",
    })
  })
}
