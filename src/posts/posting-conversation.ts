import { randomUUID } from "node:crypto"

import {
  createConversationSession,
  readConversationReplay,
  recordConversationTurn,
  resumeConversationSession,
} from "@/conversations/repository"
import type { PostingConversationDecision } from "@/conversations/contracts"
import type { PostingDecisionRequest } from "@/domain/schemas"
import type { IntegrationAdapters } from "@/integrations/contracts"
import type { SqliteDatabase } from "@/server/db/sqlite"

import { createPostDraft, revisePostDraft } from "./post-flow"
import type { PostDraftResult } from "./post-types"

type PostingDecisionOptions = {
  readonly adapters: IntegrationAdapters
  readonly database: SqliteDatabase
  readonly request: PostingDecisionRequest
  readonly storeId: string
}

type PostingDecisionResponse = {
  readonly assistantMessage: string
  readonly decision: PostingConversationDecision["decision"]
  readonly draft?: PostDraftResult
  readonly ownerQuestion?: string
  readonly questionScope?: PostingConversationDecision["questionScope"]
  readonly revisedIntent?: string
  readonly sessionId: string
  readonly status: "POSTING_CONVERSATION_TURN"
}

function readOrCreateSession(
  database: SqliteDatabase,
  request: PostingDecisionRequest,
  storeId: string,
  now: Date
) {
  if (request.sessionId !== undefined) {
    return resumeConversationSession(database, {
      kind: "posting",
      sessionId: request.sessionId,
      storeId,
    })
  }

  return createConversationSession(database, {
    id: randomUUID(),
    kind: "posting",
    now,
    state: "awaiting_suggestion_decision",
    storeId,
  })
}

function sessionStateForAdapter(
  state: string
): "awaiting_suggestion_decision" | "question_answered" {
  return state === "question_answered"
    ? "question_answered"
    : "awaiting_suggestion_decision"
}

async function draftForDecision(
  options: PostingDecisionOptions,
  decision: PostingConversationDecision
): Promise<PostDraftResult | undefined> {
  switch (decision.decision) {
    case "accepted":
      return createPostDraft({
        acceptedSuggestionId:
          decision.acceptedSuggestionId ?? options.request.activeSuggestionId,
        adapters: options.adapters,
        database: options.database,
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
        database: options.database,
        imageAssets: options.request.imageAssets ?? [],
        ownerIntent: options.request.ownerIntent,
        storeId: options.storeId,
        suggestionMode: "skipped",
        targetChannel: "GBP",
      })
    case "revision_requested":
      return revisePostDraft({
        adapters: options.adapters,
        database: options.database,
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
      return unexpectedPostingDecision(decision.decision)
  }
}

function nextStateForDecision(
  decision: PostingConversationDecision["decision"]
): string {
  switch (decision) {
    case "accepted":
    case "skipped":
    case "revision_requested":
      return "draft_ready"
    case "question":
      return "question_answered"
    default:
      return assertNever(decision)
  }
}

function slotsForDecision(decision: PostingConversationDecision) {
  switch (decision.decision) {
    case "accepted":
      return [
        {
          confidence: 0.95,
          key: "accepted_suggestion_id",
          source: "owner_message",
          value: decision.acceptedSuggestionId ?? "",
        },
      ].filter((slot) => slot.value !== "")
    case "revision_requested":
      return [
        {
          confidence: 0.88,
          key: "revised_intent",
          source: "owner_message",
          value: decision.revisedIntent ?? "",
        },
      ].filter((slot) => slot.value !== "")
    case "question":
    case "skipped":
      return []
    default:
      return unexpectedPostingDecision(decision.decision)
  }
}

export async function processPostingDecision(
  options: PostingDecisionOptions
): Promise<PostingDecisionResponse | Readonly<Record<string, unknown>>> {
  const now = options.adapters.clock.now()
  const session = readOrCreateSession(
    options.database,
    options.request,
    options.storeId,
    now
  )

  if (session === undefined) {
    return {
      status: "CONVERSATION_NOT_FOUND",
      message: "대화 세션을 찾지 못했습니다.",
    }
  }

  const replay = readConversationReplay(options.database, {
    clientEventId: options.request.clientEventId,
    sessionId: session.id,
    storeId: options.storeId,
  })
  if (replay !== undefined) {
    return replay
  }

  const classified =
    await options.adapters.postingConversation.classifyOwnerReply({
      activeSuggestionId: options.request.activeSuggestionId,
      currentState: sessionStateForAdapter(session.state),
      draftSummary: options.request.draftSummary,
      ownerMessage: options.request.ownerMessage,
      suggestionMessage: options.request.suggestionMessage,
    })

  if (classified.kind === "blocked_by_credentials") {
    return {
      status: "LLM_CREDENTIALS_REQUIRED",
      assistantMessage:
        "AI 제안 응답 분류 설정이 필요합니다. 제안은 건너뛰거나 다시 시도해주세요.",
      missingEnvVars: classified.missingEnvVars,
      sessionId: session.id,
    }
  }

  const draft = await draftForDecision(options, classified.value)
  const response: PostingDecisionResponse = {
    ...(draft === undefined ? {} : { draft }),
    ...(classified.value.ownerQuestion === undefined
      ? {}
      : { ownerQuestion: classified.value.ownerQuestion }),
    ...(classified.value.questionScope === undefined
      ? {}
      : { questionScope: classified.value.questionScope }),
    ...(classified.value.revisedIntent === undefined
      ? {}
      : { revisedIntent: classified.value.revisedIntent }),
    assistantMessage: classified.value.assistantMessage,
    decision: classified.value.decision,
    sessionId: session.id,
    status: "POSTING_CONVERSATION_TURN",
  }

  const turn = recordConversationTurn(options.database, {
    assistantMessage: response.assistantMessage,
    clientEventId: options.request.clientEventId,
    eventId: randomUUID(),
    kind: "posting",
    nextState: nextStateForDecision(classified.value.decision),
    now,
    ownerMessage: options.request.ownerMessage,
    publicResponse: response,
    sessionId: session.id,
    slots: slotsForDecision(classified.value),
    storeId: options.storeId,
  })

  return turn.response
}

class UnexpectedPostingDecisionError extends Error {
  readonly name = "UnexpectedPostingDecisionError"
}

function unexpectedPostingDecision(value: string): never {
  throw new UnexpectedPostingDecisionError(
    `Unexpected posting decision: ${value}`
  )
}

function assertNever(value: never): never {
  throw new UnexpectedPostingDecisionError(
    `Unexpected posting decision: ${String(value)}`
  )
}
