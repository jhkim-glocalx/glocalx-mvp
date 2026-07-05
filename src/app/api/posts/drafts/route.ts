import type { NextRequest } from "next/server"

import { postDraftRequestSchema } from "@/domain/schemas"
import { createPostDraft } from "@/posts/post-flow"
import {
  parseJsonRoutePayload,
  readDatabaseSession,
  requireSessionStoreAccess,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"

function generationFailureResponse(error: unknown): Response {
  console.error("Post draft generation failed", error)
  return Response.json(
    {
      status: "POST_DRAFT_GENERATION_FAILED",
      message: "AI 분석을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.",
    },
    { status: 502 }
  )
}

export async function POST(request: NextRequest) {
  return withQueryableRouteDatabase(
    async ({ adapters, postStore, sessionStore }) => {
      const session = await readDatabaseSession(request, sessionStore)
      if (session === undefined) {
        return requiredSessionResponse()
      }

      const parsed = await parseJsonRoutePayload(
        request,
        postDraftRequestSchema
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

      try {
        const result = await createPostDraft({
          adapters,
          ...(parsed.value.acceptedSuggestionId === undefined
            ? {}
            : { acceptedSuggestionId: parsed.value.acceptedSuggestionId }),
          imageAssets: parsed.value.imageAssets ?? [],
          ownerIntent: parsed.value.ownerIntent,
          postStore,
          storeId: session.storeId,
          suggestionMode: parsed.value.suggestionMode ?? "request",
          targetChannel: parsed.value.targetChannel,
        })
        return Response.json(result)
      } catch (error) {
        if (error instanceof Error) {
          return generationFailureResponse(error)
        }
        throw error
      }
    }
  )
}
