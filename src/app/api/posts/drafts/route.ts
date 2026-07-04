import type { NextRequest } from "next/server"

import { ensureDemoOwnerStore } from "@/auth/session"
import { postDraftRequestSchema } from "@/domain/schemas"
import { createPostDraft } from "@/posts/post-flow"
import {
  parseJsonRoutePayload,
  readDemoSession,
  requireSessionStoreAccess,
  requiredSessionResponse,
  withRouteDatabase,
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
  // Post generation starts from the session so drafts cannot be created anonymously.
  const session = readDemoSession(request)
  if (session === undefined) {
    return requiredSessionResponse()
  }

  const parsed = await parseJsonRoutePayload(request, postDraftRequestSchema)
  if (parsed.kind === "response") {
    return parsed.response
  }

  // The client store ID must match the session store before generation starts.
  const forbiddenResponse = requireSessionStoreAccess(
    session,
    parsed.value.storeId
  )
  if (forbiddenResponse !== undefined) {
    return forbiddenResponse
  }

  ensureDemoOwnerStore()

  return withRouteDatabase(async ({ adapters, database }) => {
    try {
      const result = await createPostDraft({
        adapters,
        database,
        ...(parsed.value.acceptedSuggestionId === undefined
          ? {}
          : { acceptedSuggestionId: parsed.value.acceptedSuggestionId }),
        imageAssets: parsed.value.imageAssets ?? [],
        ownerIntent: parsed.value.ownerIntent,
        storeId: session.storeId,
        suggestionMode: parsed.value.suggestionMode ?? "request",
        targetChannel: parsed.value.targetChannel,
      })
      return Response.json(result)
    } catch (error) {
      return generationFailureResponse(error)
    }
  })
}
