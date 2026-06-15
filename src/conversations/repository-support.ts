import { z } from "zod"

import type { SqliteDatabase } from "@/server/db/sqlite"

import { parsePublicResponse, supportEventRowSchema } from "./repository-codec"
import { readConversationDraft } from "./repository-commands"
import type { RedactedConversationSupportView } from "./repository-types"
import { redactSupportText } from "./redaction"

export function readRedactedConversationSupportView(
  database: SqliteDatabase,
  lookup: { readonly sessionId: string; readonly storeId: string }
): RedactedConversationSupportView | undefined {
  const draft = readConversationDraft(database, lookup)
  if (draft === undefined) {
    return undefined
  }
  const events = z
    .array(supportEventRowSchema)
    .parse(
      database
        .prepare(
          "SELECT client_event_id, event_type, redacted_payload_json, created_at FROM conversation_events WHERE session_id = ? ORDER BY created_at ASC"
        )
        .all(draft.session.id)
    )
    .map((event) => ({
      clientEventId: event.client_event_id,
      createdAt: event.created_at,
      eventType: event.event_type,
      redactedPayload: parsePublicResponse(event.redacted_payload_json),
    }))
  return {
    events,
    messages: draft.messages.map((message) => ({
      content: redactSupportText(message.redactedContent),
      createdAt: message.createdAt,
      role: message.role,
    })),
    sessionId: draft.session.id,
    storeId: draft.session.storeId,
  }
}
