import {
  claimQueryableReplayEvent,
  insertQueryableMessage,
  readQueryableMessages,
  readQueryableReplay,
  readQueryableSession,
  readQueryableSlots,
  requireActiveQueryableSession,
  requireQueryableSession,
  upsertQueryableSlotsForSession,
} from "@/conversations/repository-queryable-storage"
import { sessionRowSchema, toSession } from "@/conversations/repository-codec"
import type { RecordConversationTurnResult } from "@/conversations/repository"
import type { Queryable } from "@/server/db"

import type { ConversationStore } from "./conversation-store"

class ConversationTurnTransactionError extends Error {
  readonly name = "ConversationTurnTransactionError"
}

const conversationTurnRetryAttempts = 8
let recordTurnQueue: Promise<void> = Promise.resolve()

function isDatabaseLockedError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("database is locked")
}

async function enqueueRecordTurn<TResult>(
  work: () => Promise<TResult>
): Promise<TResult> {
  const previousTurn = recordTurnQueue
  let releaseCurrentTurn: () => void = () => undefined
  recordTurnQueue = new Promise<void>((resolve) => {
    releaseCurrentTurn = resolve
  })

  await previousTurn
  try {
    return await work()
  } finally {
    releaseCurrentTurn()
  }
}

async function recordTurnOnce(
  queryable: Queryable,
  options: Parameters<ConversationStore["recordTurn"]>[0]
): Promise<RecordConversationTurnResult> {
  let result: RecordConversationTurnResult | undefined
  await queryable.transaction(async (transaction) => {
    const session = await requireActiveQueryableSession(transaction, options)
    const claim = await claimQueryableReplayEvent(transaction, options)
    if (claim !== "claimed") {
      result = { kind: "replayed", response: claim }
      return
    }
    const ownerMessage = await insertQueryableMessage(
      transaction,
      session,
      "owner",
      options.ownerMessage,
      options.clientEventId,
      options.now
    )
    const assistantMessage = await insertQueryableMessage(
      transaction,
      session,
      "assistant",
      options.assistantMessage,
      null,
      options.now
    )
    await upsertQueryableSlotsForSession(
      transaction,
      session.id,
      options.slots,
      options.now
    )
    await transaction.execute(
      "UPDATE conversation_sessions SET state = ?, updated_at = ? WHERE id = ?",
      [options.nextState, options.now.toISOString(), session.id]
    )
    await transaction.execute(
      "UPDATE conversation_events SET response_message_id = ? WHERE session_id = ? AND client_event_id = ?",
      [assistantMessage.id, session.id, options.clientEventId]
    )
    result = {
      assistantMessage,
      kind: "created",
      ownerMessage,
      response: options.publicResponse,
      slots: await readQueryableSlots(transaction, session.id),
    }
  })
  if (result === undefined) {
    throw new ConversationTurnTransactionError()
  }
  return result
}

async function recordTurnWithRetry(
  queryable: Queryable,
  options: Parameters<ConversationStore["recordTurn"]>[0]
): Promise<RecordConversationTurnResult> {
  for (
    let attempt = 1;
    attempt <= conversationTurnRetryAttempts;
    attempt += 1
  ) {
    try {
      return await recordTurnOnce(queryable, options)
    } catch (error) {
      if (
        attempt < conversationTurnRetryAttempts &&
        isDatabaseLockedError(error)
      ) {
        await Promise.resolve()
        continue
      }
      throw error
    }
  }
  throw new ConversationTurnTransactionError()
}

export function createDatabaseConversationStore(
  queryable: Queryable
): ConversationStore {
  return {
    async appendAssistantMessage(options) {
      const session = await requireActiveQueryableSession(queryable, options)
      return insertQueryableMessage(
        queryable,
        session,
        "assistant",
        options.content,
        null,
        options.now
      )
    },

    async appendOwnerMessage(options) {
      const session = await requireActiveQueryableSession(queryable, options)
      return insertQueryableMessage(
        queryable,
        session,
        "owner",
        options.content,
        options.clientEventId,
        options.now
      )
    },

    async completeSession(options) {
      const session = await requireActiveQueryableSession(queryable, options)
      await queryable.execute(
        "UPDATE conversation_sessions SET status = 'completed', updated_at = ?, completed_at = ? WHERE id = ?",
        [options.now.toISOString(), options.now.toISOString(), session.id]
      )
      return requireQueryableSession(queryable, options)
    },

    async createSession(options) {
      const now = options.now.toISOString()
      await queryable.execute(
        "INSERT INTO conversation_sessions (id, store_id, kind, state, status, selected_candidate_id, selected_candidate_json, support_metadata_json, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          options.id,
          options.storeId,
          options.kind,
          options.state,
          "active",
          null,
          null,
          JSON.stringify({}),
          now,
          now,
          null,
        ]
      )
      return requireQueryableSession(queryable, {
        kind: options.kind,
        sessionId: options.id,
        storeId: options.storeId,
      })
    },

    async readCurrentSession(options) {
      const row = await queryable.queryOne(
        "SELECT * FROM conversation_sessions WHERE store_id = ? AND kind = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1",
        [options.storeId, options.kind]
      )
      return row === undefined
        ? undefined
        : toSession(sessionRowSchema.parse(row))
    },

    async readDraft(lookup) {
      const session = await readQueryableSession(queryable, lookup)
      return session === undefined
        ? undefined
        : {
            messages: await readQueryableMessages(queryable, session.id),
            session,
            slots: await readQueryableSlots(queryable, session.id),
          }
    },

    readReplay(options) {
      return readQueryableReplay(queryable, options)
    },

    recordTurn(options) {
      return enqueueRecordTurn(() => recordTurnWithRetry(queryable, options))
    },

    resumeSession(lookup) {
      return readQueryableSession(queryable, lookup)
    },

    async selectCandidate(options) {
      const session = await requireActiveQueryableSession(queryable, options)
      await queryable.execute(
        "UPDATE conversation_sessions SET selected_candidate_id = ?, selected_candidate_json = ?, state = ?, updated_at = ? WHERE id = ?",
        [
          options.candidateId,
          JSON.stringify(options.candidateJson),
          "slot_elicitation",
          options.now.toISOString(),
          session.id,
        ]
      )
      return requireQueryableSession(queryable, options)
    },

    async upsertSlots(options) {
      const session = await requireActiveQueryableSession(queryable, options)
      await upsertQueryableSlotsForSession(
        queryable,
        session.id,
        options.slots,
        options.now
      )
      return readQueryableSlots(queryable, session.id)
    },
  }
}
