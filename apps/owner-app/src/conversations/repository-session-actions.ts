import type { SqliteDatabase } from "@/server/db/sqlite"

import { requireActiveSession, requireSession } from "./repository-storage"
import type {
  ConversationSession,
  PublicConversationResponse,
} from "./repository-types"

export function selectConversationCandidate(
  database: SqliteDatabase,
  options: {
    readonly candidateId: string
    readonly candidateJson: PublicConversationResponse
    readonly now: Date
    readonly sessionId: string
    readonly storeId: string
  }
): ConversationSession {
  const session = requireActiveSession(database, options)
  database
    .prepare(
      "UPDATE conversation_sessions SET selected_candidate_id = ?, selected_candidate_json = ?, state = ?, updated_at = ? WHERE id = ?"
    )
    .run(
      options.candidateId,
      JSON.stringify(options.candidateJson),
      "slot_elicitation",
      options.now.toISOString(),
      session.id
    )
  return requireSession(database, options)
}

export function completeConversationSession(
  database: SqliteDatabase,
  options: {
    readonly now: Date
    readonly sessionId: string
    readonly storeId: string
  }
): ConversationSession {
  const session = requireActiveSession(database, options)
  database
    .prepare(
      "UPDATE conversation_sessions SET status = 'completed', updated_at = ?, completed_at = ? WHERE id = ?"
    )
    .run(options.now.toISOString(), options.now.toISOString(), session.id)
  return requireSession(database, options)
}
