import type { NextRequest } from "next/server"

import type { PostingConversationDecision } from "@/conversations/contracts"
import {
  postingDecisionRequestSchema,
  type PostingDecisionRequest,
} from "@/domain/schemas"
import type { IntegrationAdapters } from "@/integrations/contracts"
import { createPostDraft, revisePostDraft } from "@/posts/post-flow"
import {
  processPostingDecision,
  type PostingDraftWriter,
} from "@/posts/posting-conversation"
import type { SqliteDatabase } from "@/server/db/sqlite"
import {
  parseJsonRoutePayload,
  readDemoSession,
  requireSessionStoreAccess,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"

type PostingDraftWriterOptions = {
  readonly adapters: IntegrationAdapters
  readonly database: SqliteDatabase | undefined
  readonly request: PostingDecisionRequest
  readonly storeId: string
}

class PostingDraftPersistenceUnavailableError extends Error {
  readonly name = "PostingDraftPersistenceUnavailableError"
}

function createPostingDraftWriter(
  options: PostingDraftWriterOptions
): PostingDraftWriter {
  return async (decision: PostingConversationDecision) => {
    const database = options.database
    if (database === undefined) {
      throw new PostingDraftPersistenceUnavailableError(
        "Posting draft persistence is not available for this database provider"
      )
    }

    switch (decision.decision) {
      case "accepted":
        return createPostDraft({
          acceptedSuggestionId:
            decision.acceptedSuggestionId ?? options.request.activeSuggestionId,
          adapters: options.adapters,
          database,
          imageAssets: options.request.imageAssets ?? [],
          ownerIntent:
            options.request.suggestionRevisedIntent ??
            options.request.ownerIntent,
          storeId: options.storeId,
          suggestionMode: "accepted",
          targetChannel: "GBP",
        })
      case "skipped":
        return createPostDraft({
          adapters: options.adapters,
          database,
          imageAssets: options.request.imageAssets ?? [],
          ownerIntent: options.request.ownerIntent,
          storeId: options.storeId,
          suggestionMode: "skipped",
          targetChannel: "GBP",
        })
      case "revision_requested":
        return revisePostDraft({
          adapters: options.adapters,
          database,
          imageAssets: options.request.imageAssets ?? [],
          originalDraftId: options.request.draftId,
          ownerIntent: decision.revisedIntent ?? options.request.ownerMessage,
          storeId: options.storeId,
          suggestionMode: "skipped",
          targetChannel: "GBP",
        })
      case "question":
        return undefined
      default:
        return assertNeverPostingDecision(decision.decision)
    }
  }
}

function assertNeverPostingDecision(value: never): never {
  throw new PostingDraftPersistenceUnavailableError(
    `Unexpected posting decision: ${String(value)}`
  )
}

function conversationFailureResponse(error: unknown): Response {
  console.error("Posting conversation failed", error)
  return Response.json(
    {
      status: "POSTING_CONVERSATION_FAILED",
      message: "AI 제안 응답을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.",
    },
    { status: 502 }
  )
}

export async function POST(request: NextRequest) {
  // Posting decisions are session-scoped before accepting any conversation payload.
  const session = readDemoSession(request)
  if (session === undefined) {
    return requiredSessionResponse()
  }

  const parsed = await parseJsonRoutePayload(
    request,
    postingDecisionRequestSchema
  )
  if (parsed.kind === "response") {
    return parsed.response
  }

  // Conversation updates are rejected if the requested store is not session-owned.
  const forbiddenResponse = requireSessionStoreAccess(
    session,
    parsed.value.storeId
  )
  if (forbiddenResponse !== undefined) {
    return forbiddenResponse
  }

  return withQueryableRouteDatabase(
    async ({ adapters, conversationStore, legacySqliteDatabase }) => {
      const draftWriter = createPostingDraftWriter({
        adapters,
        database: legacySqliteDatabase,
        request: parsed.value,
        storeId: session.storeId,
      })

      try {
        const result = await processPostingDecision({
          adapters,
          conversationStore,
          draftWriter,
          request: parsed.value,
          storeId: session.storeId,
        })
        const status = result["status"] === "CONVERSATION_NOT_FOUND" ? 404 : 200
        return Response.json(result, { status })
      } catch (error) {
        if (error instanceof Error) {
          return conversationFailureResponse(error)
        }
        throw error
      }
    }
  )
}
