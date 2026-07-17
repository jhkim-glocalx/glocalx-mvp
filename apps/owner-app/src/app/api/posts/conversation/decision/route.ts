import type { NextRequest } from "next/server"

import type { PostingConversationDecision } from "@/conversations/contracts"
import {
  postingDecisionRequestSchema,
  type PostingDecisionRequest,
} from "@glocalx/domain"
import type { IntegrationAdapters } from "@/integrations/contracts"
import { createPostDraft, revisePostDraft } from "@/posts/post-flow"
import {
  processPostingDecision,
  type PostingDraftWriter,
} from "@/posts/posting-conversation"
import type { PostStore } from "@/server/repositories/post-store"
import {
  parseJsonRoutePayload,
  readDatabaseSession,
  requireSessionStoreAccess,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"

type PostingDraftWriterOptions = {
  readonly adapters: IntegrationAdapters
  readonly postStore: PostStore
  readonly request: PostingDecisionRequest
  readonly storeId: string
}

class UnexpectedPostingDecisionError extends Error {
  readonly name = "UnexpectedPostingDecisionError"

  constructor(value: never) {
    super(`Unexpected posting decision: ${String(value)}`)
  }
}

function createPostingDraftWriter(
  options: PostingDraftWriterOptions
): PostingDraftWriter {
  return async (decision: PostingConversationDecision) => {
    switch (decision.decision) {
      case "accepted":
        return createPostDraft({
          acceptedSuggestionId:
            decision.acceptedSuggestionId ?? options.request.activeSuggestionId,
          adapters: options.adapters,
          imageAssets: options.request.imageAssets ?? [],
          ownerIntent:
            options.request.suggestionRevisedIntent ??
            options.request.ownerIntent,
          postStore: options.postStore,
          storeId: options.storeId,
          suggestionMode: "accepted",
          targetChannel: options.request.targetChannel,
        })
      case "skipped":
        return createPostDraft({
          adapters: options.adapters,
          imageAssets: options.request.imageAssets ?? [],
          ownerIntent: options.request.ownerIntent,
          postStore: options.postStore,
          storeId: options.storeId,
          suggestionMode: "skipped",
          targetChannel: options.request.targetChannel,
        })
      case "revision_requested":
        return revisePostDraft({
          adapters: options.adapters,
          imageAssets: options.request.imageAssets ?? [],
          originalDraftId: options.request.draftId,
          ownerIntent: decision.revisedIntent ?? options.request.ownerMessage,
          postStore: options.postStore,
          storeId: options.storeId,
          suggestionMode: "skipped",
          targetChannel: options.request.targetChannel,
        })
      case "question":
        return undefined
      default:
        return assertNeverPostingDecision(decision.decision)
    }
  }
}

function assertNeverPostingDecision(value: never): never {
  throw new UnexpectedPostingDecisionError(value)
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
  return withQueryableRouteDatabase(
    async ({ adapters, conversationStore, postStore, sessionStore }) => {
      const session = await readDatabaseSession(request, sessionStore)
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

      const forbiddenResponse = requireSessionStoreAccess(
        session,
        parsed.value.storeId
      )
      if (forbiddenResponse !== undefined) {
        return forbiddenResponse
      }

      const draftWriter = createPostingDraftWriter({
        adapters,
        postStore,
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
