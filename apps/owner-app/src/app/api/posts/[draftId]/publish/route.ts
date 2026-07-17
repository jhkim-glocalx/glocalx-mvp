import type { NextRequest } from "next/server"

import { postPublishRequestSchema } from "@glocalx/domain"
import { publishPostDraft } from "@/posts/post-flow"
import {
  parseJsonRoutePayload,
  readDatabaseSession,
  requireSessionStoreAccess,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"

type PublishRouteContext = {
  // Next canary provides dynamic route params as a promise in route handlers.
  readonly params: Promise<{
    readonly draftId: string
  }>
}

export async function POST(request: NextRequest, context: PublishRouteContext) {
  return withQueryableRouteDatabase(
    async ({ adapters, postStore, sessionStore }) => {
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

      const { draftId } = await context.params

      const result =
        parsed.value.idempotencyKey === undefined
          ? await publishPostDraft({
              adapters,
              draftId,
              postStore,
              storeId: session.storeId,
              targetChannel: parsed.value.targetChannel,
            })
          : await publishPostDraft({
              adapters,
              draftId,
              idempotencyKey: parsed.value.idempotencyKey,
              postStore,
              storeId: session.storeId,
              targetChannel: parsed.value.targetChannel,
            })
      const status =
        result.status === "BLOCKED" && result.code === "DRAFT_NOT_FOUND"
          ? 404
          : result.status === "BLOCKED" ||
              result.status === "MANUAL_PUBLISH_REQUIRED"
            ? 409
            : 200
      return Response.json(result, { status })
    }
  )
}
