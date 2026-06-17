import { z } from "zod"

import {
  conversationKinds,
  type ConversationMessage,
  type ConversationSession,
  type ConversationSlotValue,
  type PublicConversationResponse,
} from "./repository-types"

const conversationKindSchema = z.enum(conversationKinds)
const conversationStatusSchema = z.enum(["active", "completed"])
const messageRoleSchema = z.enum(["owner", "assistant"])
const publicResponseSchema = z.record(z.string(), z.unknown())

// SQLite rows are decoded here before any caller sees domain-shaped objects.
export const sessionRowSchema = z.object({
  id: z.string(),
  store_id: z.string(),
  kind: conversationKindSchema,
  state: z.string(),
  status: conversationStatusSchema,
  selected_candidate_id: z.string().nullable(),
  selected_candidate_json: z.string().nullable(),
  support_metadata_json: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
})

export const messageRowSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  role: messageRoleSchema,
  client_event_id: z.string().nullable(),
  content: z.string(),
  redacted_content: z.string(),
  sequence: z.number(),
  created_at: z.string(),
})

export const slotRowSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  slot_key: z.string(),
  value: z.string(),
  source: z.string(),
  confidence: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const sequenceRowSchema = z.object({
  next_sequence: z.number(),
})

export const supportEventRowSchema = z.object({
  client_event_id: z.string(),
  event_type: z.string(),
  redacted_payload_json: z.string(),
  created_at: z.string(),
})

export const replayRowSchema = z.object({
  public_response_json: z.string(),
})

// Replay responses stay JSON-shaped but still cross this parsed boundary.
export function parsePublicResponse(value: string): PublicConversationResponse {
  return publicResponseSchema.parse(parseJson(value))
}

// Row-to-domain conversion is intentionally mechanical: snake_case in, API shape out.
export function toSession(
  row: z.infer<typeof sessionRowSchema>
): ConversationSession {
  return {
    completedAt: row.completed_at,
    createdAt: row.created_at,
    id: row.id,
    kind: row.kind,
    selectedCandidate:
      row.selected_candidate_json === null
        ? null
        : parseJson(row.selected_candidate_json),
    selectedCandidateId: row.selected_candidate_id,
    state: row.state,
    status: row.status,
    storeId: row.store_id,
    supportMetadata: parsePublicResponse(row.support_metadata_json),
    updatedAt: row.updated_at,
  }
}

export function toMessage(
  row: z.infer<typeof messageRowSchema>
): ConversationMessage {
  return {
    clientEventId: row.client_event_id,
    content: row.content,
    createdAt: row.created_at,
    id: row.id,
    redactedContent: row.redacted_content,
    role: row.role,
    sequence: row.sequence,
    sessionId: row.session_id,
  }
}

export function toSlot(
  row: z.infer<typeof slotRowSchema>
): ConversationSlotValue {
  return {
    confidence: row.confidence,
    createdAt: row.created_at,
    id: row.id,
    key: row.slot_key,
    sessionId: row.session_id,
    source: row.source,
    updatedAt: row.updated_at,
    value: row.value,
  }
}

function parseJson(value: string): unknown {
  const parsed: unknown = JSON.parse(value)
  return parsed
}
