import { createHash, randomUUID } from "node:crypto"

import { z } from "zod"

import type { SqliteDatabase } from "@/server/db/sqlite"

import {
  messageRowSchema,
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
} from "./repository-types"
import { redactSupportText } from "./redaction"

export type SessionLookup = {
  readonly kind?: ConversationKind
  readonly sessionId: string
  readonly storeId: string
}

export function readSession(
  database: SqliteDatabase,
  lookup: SessionLookup
): ConversationSession | undefined {
  const row =
    lookup.kind === undefined
      ? database
          .prepare(
            "SELECT * FROM conversation_sessions WHERE id = ? AND store_id = ?"
          )
          .get(lookup.sessionId, lookup.storeId)
      : database
          .prepare(
            "SELECT * FROM conversation_sessions WHERE id = ? AND store_id = ? AND kind = ?"
          )
          .get(lookup.sessionId, lookup.storeId, lookup.kind)
  return row === undefined ? undefined : toSession(sessionRowSchema.parse(row))
}

export function requireSession(
  database: SqliteDatabase,
  lookup: SessionLookup
): ConversationSession {
  const session = readSession(database, lookup)
  if (session === undefined) {
    throw new ConversationNotFoundError(lookup.sessionId)
  }
  return session
}

export function requireActiveSession(
  database: SqliteDatabase,
  lookup: SessionLookup
): ConversationSession {
  const session = requireSession(database, lookup)
  if (session.status === "completed") {
    throw new ConversationSessionCompletedError(session.id)
  }
  return session
}

export function insertMessage(
  database: SqliteDatabase,
  session: ConversationSession,
  role: "owner" | "assistant",
  content: string,
  clientEventId: string | null,
  now: Date
): ConversationMessage {
  const id = randomUUID()
  // Store raw and redacted text together so support reads never need to redact later.
  database
    .prepare(
      "INSERT INTO conversation_messages (id, session_id, role, client_event_id, content, redacted_content, sequence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      id,
      session.id,
      role,
      clientEventId,
      content,
      redactSupportText(content),
      nextMessageSequence(database, session.id),
      now.toISOString()
    )
  return toMessage(
    messageRowSchema.parse(
      database
        .prepare("SELECT * FROM conversation_messages WHERE id = ?")
        .get(id)
    )
  )
}

export function upsertSlotsForSession(
  database: SqliteDatabase,
  sessionId: string,
  slots: readonly ConversationSlotInput[],
  now: Date
): void {
  for (const slot of slots) {
    assertValidSlot(slot)
    // Deterministic session/key IDs keep slot records stable across repeated upserts.
    database
      .prepare(
        "INSERT INTO conversation_slot_values (id, session_id, slot_key, value, source, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(session_id, slot_key) DO UPDATE SET value = excluded.value, source = excluded.source, confidence = excluded.confidence, updated_at = excluded.updated_at"
      )
      .run(
        stableId("conversation-slot", `${sessionId}:${slot.key}`),
        sessionId,
        slot.key,
        slot.value,
        slot.source,
        slot.confidence,
        now.toISOString(),
        now.toISOString()
      )
  }
}

export function readMessages(
  database: SqliteDatabase,
  sessionId: string
): readonly ConversationMessage[] {
  return z
    .array(messageRowSchema)
    .parse(
      database
        .prepare(
          "SELECT * FROM conversation_messages WHERE session_id = ? ORDER BY sequence ASC"
        )
        .all(sessionId)
    )
    .map(toMessage)
}

export function readSlots(
  database: SqliteDatabase,
  sessionId: string
): readonly ConversationSlotValue[] {
  return z
    .array(slotRowSchema)
    .parse(
      database
        .prepare(
          "SELECT * FROM conversation_slot_values WHERE session_id = ? ORDER BY slot_key ASC"
        )
        .all(sessionId)
    )
    .map(toSlot)
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

function nextMessageSequence(
  database: SqliteDatabase,
  sessionId: string
): number {
  // Sequence numbers are session-local and allocated from persisted rows at insert time.
  return sequenceRowSchema.parse(
    database
      .prepare(
        "SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM conversation_messages WHERE session_id = ?"
      )
      .get(sessionId)
  ).next_sequence
}

function stableId(prefix: string, value: string): string {
  // Hashing keeps stable IDs deterministic without exposing the raw session/key tuple.
  const digest = createHash("sha256").update(value).digest("base64url")
  return `${prefix}-${digest.slice(0, 32)}`
}
