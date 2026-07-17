import { createHash, randomUUID } from "node:crypto"

import { z } from "zod"

import type { Queryable } from "@/server/db"

import {
  messageRowSchema,
  parsePublicResponse,
  replayRowSchema,
  sequenceRowSchema,
  sessionRowSchema,
  slotRowSchema,
  toMessage,
  toSession,
  toSlot,
} from "./repository-codec"
import {
  ConversationInvalidSlotError,
  ConversationNotFoundError,
  ConversationSessionCompletedError,
  type ConversationKind,
  type ConversationMessage,
  type ConversationSession,
  type ConversationSlotInput,
  type ConversationSlotValue,
  type PublicConversationResponse,
} from "./repository-types"
import { redactedTurnPayload, redactSupportText } from "./redaction"

export type QueryableSessionLookup = {
  readonly kind?: ConversationKind
  readonly sessionId: string
  readonly storeId: string
}

export type QueryableRecordTurnOptions = QueryableSessionLookup & {
  readonly assistantMessage: string
  readonly clientEventId: string
  readonly eventId: string
  readonly nextState: string
  readonly now: Date
  readonly ownerMessage: string
  readonly publicResponse: PublicConversationResponse
  readonly slots: readonly ConversationSlotInput[]
}

class ConversationReplayClaimError extends Error {
  readonly name = "ConversationReplayClaimError"
}

export async function readQueryableSession(
  queryable: Queryable,
  lookup: QueryableSessionLookup
): Promise<ConversationSession | undefined> {
  const row =
    lookup.kind === undefined
      ? await queryable.queryOne(
          "SELECT * FROM conversation_sessions WHERE id = ? AND store_id = ?",
          [lookup.sessionId, lookup.storeId]
        )
      : await queryable.queryOne(
          "SELECT * FROM conversation_sessions WHERE id = ? AND store_id = ? AND kind = ?",
          [lookup.sessionId, lookup.storeId, lookup.kind]
        )
  return row === undefined ? undefined : toSession(sessionRowSchema.parse(row))
}

export async function requireQueryableSession(
  queryable: Queryable,
  lookup: QueryableSessionLookup
): Promise<ConversationSession> {
  const session = await readQueryableSession(queryable, lookup)
  if (session === undefined) {
    throw new ConversationNotFoundError(lookup.sessionId)
  }
  return session
}

export async function requireActiveQueryableSession(
  queryable: Queryable,
  lookup: QueryableSessionLookup
): Promise<ConversationSession> {
  const session = await requireQueryableSession(queryable, lookup)
  if (session.status === "completed") {
    throw new ConversationSessionCompletedError(session.id)
  }
  return session
}

export async function readQueryableReplay(
  queryable: Queryable,
  lookup: {
    readonly clientEventId: string
    readonly sessionId: string
    readonly storeId: string
  }
): Promise<PublicConversationResponse | undefined> {
  const row = await queryable.queryOne(
    "SELECT e.public_response_json FROM conversation_events e JOIN conversation_sessions s ON s.id = e.session_id WHERE e.session_id = ? AND e.client_event_id = ? AND s.store_id = ?",
    [lookup.sessionId, lookup.clientEventId, lookup.storeId]
  )
  return row === undefined
    ? undefined
    : parsePublicResponse(replayRowSchema.parse(row).public_response_json)
}

export async function insertQueryableMessage(
  queryable: Queryable,
  session: ConversationSession,
  role: "owner" | "assistant",
  content: string,
  clientEventId: string | null,
  now: Date
): Promise<ConversationMessage> {
  const id = randomUUID()
  await queryable.execute(
    "INSERT INTO conversation_messages (id, session_id, role, client_event_id, content, redacted_content, sequence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      session.id,
      role,
      clientEventId,
      content,
      redactSupportText(content),
      await nextMessageSequence(queryable, session.id),
      now.toISOString(),
    ]
  )
  const row = await queryable.queryOne(
    "SELECT * FROM conversation_messages WHERE id = ?",
    [id]
  )
  return toMessage(messageRowSchema.parse(row))
}

export async function upsertQueryableSlotsForSession(
  queryable: Queryable,
  sessionId: string,
  slots: readonly ConversationSlotInput[],
  now: Date
): Promise<void> {
  for (const slot of slots) {
    assertValidSlot(slot)
    await queryable.execute(
      "INSERT INTO conversation_slot_values (id, session_id, slot_key, value, source, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(session_id, slot_key) DO UPDATE SET value = excluded.value, source = excluded.source, confidence = excluded.confidence, updated_at = excluded.updated_at",
      [
        stableId("conversation-slot", `${sessionId}:${slot.key}`),
        sessionId,
        slot.key,
        slot.value,
        slot.source,
        slot.confidence,
        now.toISOString(),
        now.toISOString(),
      ]
    )
  }
}

export async function readQueryableMessages(
  queryable: Queryable,
  sessionId: string
): Promise<readonly ConversationMessage[]> {
  const rows = await queryable.query(
    "SELECT * FROM conversation_messages WHERE session_id = ? ORDER BY sequence ASC",
    [sessionId]
  )
  return z.array(messageRowSchema).parse(rows).map(toMessage)
}

export async function readQueryableSlots(
  queryable: Queryable,
  sessionId: string
): Promise<readonly ConversationSlotValue[]> {
  const rows = await queryable.query(
    "SELECT * FROM conversation_slot_values WHERE session_id = ? ORDER BY slot_key ASC",
    [sessionId]
  )
  return z.array(slotRowSchema).parse(rows).map(toSlot)
}

export async function claimQueryableReplayEvent(
  queryable: Queryable,
  options: QueryableRecordTurnOptions
): Promise<"claimed" | PublicConversationResponse> {
  const result = await queryable.execute(
    "INSERT INTO conversation_events (id, session_id, client_event_id, event_type, response_message_id, public_response_json, redacted_payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(session_id, client_event_id) DO NOTHING",
    [
      options.eventId,
      options.sessionId,
      options.clientEventId,
      "turn_recorded",
      null,
      JSON.stringify(options.publicResponse),
      JSON.stringify(redactedTurnPayload(options)),
      options.now.toISOString(),
    ]
  )
  if (result.changes > 0) {
    return "claimed"
  }
  const replay = await readQueryableReplay(queryable, options)
  if (replay === undefined) {
    throw new ConversationReplayClaimError(
      "Conversation replay claim is missing"
    )
  }
  return replay
}

async function nextMessageSequence(
  queryable: Queryable,
  sessionId: string
): Promise<number> {
  const row = await queryable.queryOne(
    "SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM conversation_messages WHERE session_id = ?",
    [sessionId]
  )
  return sequenceRowSchema.parse(row).next_sequence
}

function assertValidSlot(slot: ConversationSlotInput): void {
  if (
    slot.key.trim() === "" ||
    !Number.isFinite(slot.confidence) ||
    slot.confidence < 0 ||
    slot.confidence > 1
  ) {
    throw new ConversationInvalidSlotError(slot.key, slot.confidence)
  }
}

function stableId(prefix: string, value: string): string {
  const digest = createHash("sha256").update(value).digest("base64url")
  return `${prefix}-${digest.slice(0, 32)}`
}
