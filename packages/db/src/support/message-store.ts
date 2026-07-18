import type {
  AdminFacingMessage,
  CsAuthorKind,
  CsMessageSender,
  OwnerFacingMessage,
} from "@glocalx/domain/support/contracts"
import { z } from "zod"

import type { Queryable } from "../types.ts"
import { encodeMessageCursor, type MessageCursor } from "./cursor.ts"
import { nullableTimestampSchema, timestampSchema } from "./row-codecs.ts"

export const csMessageDefaultPageSize = 50

export type CsMessageInsert = {
  readonly id: string
  readonly conversationId: string
  readonly sender: CsMessageSender
  readonly authorKind: CsAuthorKind
  readonly authorAdminId: string | null
  readonly body: string
  readonly now: Date
}

export type CsMessagePage<TMessage> = {
  readonly messages: readonly TMessage[]
  // The cursor to poll after next. Null when the page was empty, so a caller
  // holds on to its previous cursor rather than resetting to the beginning.
  readonly nextCursor: string | null
}

export type ListMessagesInput = {
  readonly conversationId: string
  // Explicit `| undefined` so a route can forward decodeMessageCursor()'s
  // result directly under exactOptionalPropertyTypes.
  readonly after?: MessageCursor | undefined
  readonly limit?: number | undefined
}

export interface CsMessageStore {
  appendMessage(input: CsMessageInsert): Promise<AdminFacingMessage>
  listOwnerMessages(
    input: ListMessagesInput
  ): Promise<CsMessagePage<OwnerFacingMessage>>
  listAdminMessages(
    input: ListMessagesInput
  ): Promise<CsMessagePage<AdminFacingMessage>>
  // Owner reading clears assistant messages; admin reading clears owner
  // messages. Returns how many rows were newly marked read.
  markOwnerRead(conversationId: string, now: Date): Promise<number>
  markAdminRead(conversationId: string, now: Date): Promise<number>
  countUnreadForOwner(conversationId: string): Promise<number>
}

const adminMessageRowSchema = z.object({
  id: z.string(),
  sender: z.enum(["owner", "assistant"]),
  authorKind: z.enum(["user", "ai", "admin"]),
  authorAdminId: z.string().nullable(),
  body: z.string(),
  createdAt: timestampSchema,
  ownerReadAt: nullableTimestampSchema,
  adminReadAt: nullableTimestampSchema,
})

const adminMessageProjection = `
  id,
  sender,
  author_kind AS "authorKind",
  author_admin_id AS "authorAdminId",
  body,
  created_at AS "createdAt",
  owner_read_at AS "ownerReadAt",
  admin_read_at AS "adminReadAt"
`

function toAdminMessage(row: unknown): AdminFacingMessage {
  return adminMessageRowSchema.parse(row)
}

function pageLimit(limit: number | undefined): number {
  if (limit === undefined || limit <= 0) {
    return csMessageDefaultPageSize
  }
  return Math.min(limit, csMessageDefaultPageSize)
}

// Chronological cursor read: strictly after (created_at, id), with id as the
// tiebreak for a shared timestamp. Backed by the (conversation_id, created_at,
// id) index. The explicit OR form (rather than a row-value comparison) keeps
// the statement portable across SQLite and Postgres.
async function readAdminMessagePage(
  queryable: Queryable,
  input: ListMessagesInput
): Promise<readonly AdminFacingMessage[]> {
  const limit = pageLimit(input.limit)
  if (input.after === undefined) {
    const rows = await queryable.query(
      `SELECT ${adminMessageProjection}
         FROM cs_messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC, id ASC
        LIMIT ?`,
      [input.conversationId, limit]
    )
    return rows.map(toAdminMessage)
  }
  const rows = await queryable.query(
    `SELECT ${adminMessageProjection}
       FROM cs_messages
      WHERE conversation_id = ?
        AND (created_at > ? OR (created_at = ? AND id > ?))
      ORDER BY created_at ASC, id ASC
      LIMIT ?`,
    [
      input.conversationId,
      input.after.createdAt,
      input.after.createdAt,
      input.after.id,
      limit,
    ]
  )
  return rows.map(toAdminMessage)
}

function nextCursorFor(
  messages: readonly { readonly createdAt: string; readonly id: string }[]
): string | null {
  const last = messages.at(-1)
  return last === undefined
    ? null
    : encodeMessageCursor({ createdAt: last.createdAt, id: last.id })
}

function toOwnerMessage(message: AdminFacingMessage): OwnerFacingMessage {
  // Deliberately drops author_kind/author_admin_id — no owner-facing read ever
  // reveals whether a human or the AI replied (architecture §2).
  return {
    id: message.id,
    sender: message.sender,
    body: message.body,
    createdAt: message.createdAt,
  }
}

export function createDatabaseCsMessageStore(
  queryable: Queryable
): CsMessageStore {
  return {
    async appendMessage(input) {
      const now = input.now.toISOString()
      await queryable.execute(
        `INSERT INTO cs_messages (
           id, conversation_id, sender, author_kind, author_admin_id, body,
           created_at, owner_read_at, admin_read_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
        [
          input.id,
          input.conversationId,
          input.sender,
          input.authorKind,
          input.authorAdminId,
          input.body,
          now,
        ]
      )
      return {
        id: input.id,
        sender: input.sender,
        authorKind: input.authorKind,
        authorAdminId: input.authorAdminId,
        body: input.body,
        createdAt: now,
        ownerReadAt: null,
        adminReadAt: null,
      }
    },

    async listAdminMessages(input) {
      const messages = await readAdminMessagePage(queryable, input)
      return { messages, nextCursor: nextCursorFor(messages) }
    },

    async listOwnerMessages(input) {
      const adminMessages = await readAdminMessagePage(queryable, input)
      const messages = adminMessages.map(toOwnerMessage)
      return { messages, nextCursor: nextCursorFor(messages) }
    },

    async markOwnerRead(conversationId, now) {
      const result = await queryable.execute(
        `UPDATE cs_messages
            SET owner_read_at = ?
          WHERE conversation_id = ?
            AND sender = 'assistant'
            AND owner_read_at IS NULL`,
        [now.toISOString(), conversationId]
      )
      return result.changes
    },

    async markAdminRead(conversationId, now) {
      const result = await queryable.execute(
        `UPDATE cs_messages
            SET admin_read_at = ?
          WHERE conversation_id = ?
            AND sender = 'owner'
            AND admin_read_at IS NULL`,
        [now.toISOString(), conversationId]
      )
      return result.changes
    },

    async countUnreadForOwner(conversationId) {
      const row = await queryable.queryOne(
        `SELECT COUNT(*) AS count
           FROM cs_messages
          WHERE conversation_id = ?
            AND sender = 'assistant'
            AND owner_read_at IS NULL`,
        [conversationId]
      )
      return z.coerce.number().parse(row?.["count"] ?? 0)
    },
  }
}
