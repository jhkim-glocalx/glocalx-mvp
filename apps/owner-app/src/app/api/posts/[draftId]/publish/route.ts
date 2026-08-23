import type { NextRequest } from "next/server"

import { postPublishRequestSchema } from "@glocalx/domain"
import type { PublishPostResult } from "@/posts/post-flow"
import {
  parseJsonRoutePayload,
  readDatabaseSession,
  requireSessionStoreAccess,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"

type PublishRouteContext = {
  // Next canary provides dynamic route params as a promise in route handlers;
  // draftId itself is unused now that publishing is admin-only (see below).
  readonly params: Promise<{
    readonly draftId: string
  }>
}

export async function POST(
  request: NextRequest,
  _context: PublishRouteContext
) {
  return withQueryableRouteDatabase(async ({ sessionStore }) => {
    const session = await readDatabaseSession(request, sessionStore)
    if (session === undefined) {
      return requiredSessionResponse()
    }

    const parsed = await parseJsonRoutePayload(
      request,
      postPublishRequestSchema
    )
    if (parsed.kind === "response") {
      return parsed.response
    }

    const forbiddenResponse = requireSessionStoreAccess(
      session,
      parsed.value.storeId
    )
    if (forbiddenResponse !== undefined) {
      return forbiddenResponse
    }

    // Owner self-serve direct publish is paused: the admin Campaigns queue is
    // the only publish path for now, so this route short-circuits before
    // touching post-flow's publish/idempotency machinery.
    const result: PublishPostResult = {
      status: "BLOCKED",
      code: "ADMIN_PUBLISH_ONLY",
      message:
        "지금은 담당 운영팀이 검토 후 게시합니다. 마케팅 소재 요청에서 사진과 문구를 보내주시면 곧 게시해드릴게요.",
    }
    return Response.json(result, { status: 409 })
  })
}
