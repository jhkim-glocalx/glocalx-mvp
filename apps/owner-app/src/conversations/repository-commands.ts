import type { SqliteDatabase } from "@glocalx/db/sqlite"

import {
  parsePublicResponse,
  replayRowSchema,
  sessionRowSchema,
  toSession,
} from "./repository-codec"
import {
  type ConversationDraft,
  type ConversationKind,
  type ConversationMessage,
  type ConversationSession,
  type ConversationSlotInput,
  type ConversationSlotValue,
  type PublicConversationResponse,
  type RecordConversationTurnResult,
} from "./repository-types"
import {
  insertMessage,
  readMessages,
  readSession,
  readSlots,
  requireActiveSession,
  requireSession,
  type SessionLookup,
  upsertSlotsForSession,
} from "./repository-storage"
import { redactedTurnPayload } from "./redaction"

type CreateConversationSessionOptions = {
  readonly id: string
  readonly kind: ConversationKind
  readonly now: Date
  readonly state: string
  readonly storeId: string
}

type RecordConversationTurnOptions = SessionLookup & {
  readonly assistantMessage: string
  readonly clientEventId: string
  readonly eventId: string
  readonly nextState: string
  readonly now: Date
  readonly ownerMessage: string
  readonly publicResponse: PublicConversationResponse
  readonly slots: readonly ConversationSlotInput[]
}

export function createConversationSession(
  database: SqliteDatabase,
  options: CreateConversationSessionOptions
): ConversationSession {
  const now = options.now.toISOString()
  database
    .prepare(
      "INSERT INTO conversation_sessions (id, store_id, kind, state, status, selected_candidate_id, selected_candidate_json, support_metadata_json, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
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
      null
    )
  return requireSession(database, {
    kind: options.kind,
    sessionId: options.id,
    storeId: options.storeId,
  })
}

export function resumeConversationSession(
  database: SqliteDatabase,
  lookup: SessionLookup
): ConversationSession | undefined {
  return readSession(database, lookup)
}

export function readCurrentConversationSession(
  database: SqliteDatabase,
  options: { readonly kind: ConversationKind; readonly storeId: string }
): ConversationSession | undefined {
  const row = database
    .prepare(
      "SELECT * FROM conversation_sessions WHERE store_id = ? AND kind = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1"
    )
    .get(options.storeId, options.kind)
  return row === undefined ? undefined : toSession(sessionRowSchema.parse(row))
}

export function appendOwnerMessage(
  database: SqliteDatabase,
  options: SessionLookup & {
    readonly clientEventId: string
    readonly content: string
    readonly now: Date
  }
): ConversationMessage {
  const session = requireActiveSession(database, options)
  return insertMessage(
    database,
    session,
    "owner",
    options.content,
    options.clientEventId,
    options.now
  )
}

export function appendAssistantMessage(
  database: SqliteDatabase,
  options: SessionLookup & { readonly content: string; readonly now: Date }
): ConversationMessage {
  const session = requireActiveSession(database, options)
  return insertMessage(
    database,
    session,
    "assistant",
    options.content,
    null,
    options.now
  )
}

export function upsertConversationSlots(
  database: SqliteDatabase,
  options: SessionLookup & {
    readonly now: Date
    readonly slots: readonly ConversationSlotInput[]
  }
): readonly ConversationSlotValue[] {
  const session = requireActiveSession(database, options)
  upsertSlotsForSession(database, session.id, options.slots, options.now)
  return readSlots(database, session.id)
}

export function readConversationReplay(
  database: SqliteDatabase,
  lookup: {
    readonly clientEventId: string
    readonly sessionId: string
    readonly storeId: string
  }
): PublicConversationResponse | undefined {
  // Client event replay is scoped to session and store to make retried turns idempotent.
  const row = database
    .prepare(
      "SELECT e.public_response_json FROM conversation_events e JOIN conversation_sessions s ON s.id = e.session_id WHERE e.session_id = ? AND e.client_event_id = ? AND s.store_id = ?"
    )
    .get(lookup.sessionId, lookup.clientEventId, lookup.storeId)
  return row === undefined
    ? undefined
    : parsePublicResponse(replayRowSchema.parse(row).public_response_json)
}

export function recordConversationTurn(
  database: SqliteDatabase,
  options: RecordConversationTurnOptions
): RecordConversationTurnResult {
  const replay = readConversationReplay(database, options)
  if (replay !== undefined) {
    return { kind: "replayed", response: replay }
  }
  // A new turn is persisted atomically so messages, slots, state, and replay event agree.
  return database.transaction(
    (turn: RecordConversationTurnOptions): RecordConversationTurnResult => {
      const session = requireActiveSession(database, turn)
      const ownerMessage = insertMessage(
        database,
        session,
        "owner",
        turn.ownerMessage,
        turn.clientEventId,
        turn.now
      )
      const assistantMessage = insertMessage(
        database,
        session,
        "assistant",
        turn.assistantMessage,
        null,
        turn.now
      )
      upsertSlotsForSession(database, session.id, turn.slots, turn.now)
      database
        .prepare(
          "UPDATE conversation_sessions SET state = ?, updated_at = ? WHERE id = ?"
        )
        .run(turn.nextState, turn.now.toISOString(), session.id)
      database
        .prepare(
          "INSERT INTO conversation_events (id, session_id, client_event_id, event_type, response_message_id, public_response_json, redacted_payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .run(
          turn.eventId,
          session.id,
          turn.clientEventId,
          "turn_recorded",
          assistantMessage.id,
          JSON.stringify(turn.publicResponse),
          // Support diagnostics use the redacted payload; replay uses public_response_json above.
          JSON.stringify(redactedTurnPayload(turn)),
          turn.now.toISOString()
        )
      return {
        assistantMessage,
        kind: "created",
        ownerMessage,
        response: turn.publicResponse,
        slots: readSlots(database, session.id),
      }
    }
  )(options)
}

export function readConversationDraft(
  database: SqliteDatabase,
  lookup: { readonly sessionId: string; readonly storeId: string }
): ConversationDraft | undefined {
  const session = resumeConversationSession(database, lookup)
  return session === undefined
    ? undefined
    : {
        messages: readMessages(database, session.id),
        session,
        slots: readSlots(database, session.id),
      }
}
