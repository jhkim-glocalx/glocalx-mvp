import type {
  AdminFacingMessage,
  CsAuthorKind,
  CsMessageSender,
  CsMessageStatus,
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
  // Defaults to 'sent'. Only AI compositions in `ai_draft` mode pass 'draft',
  // which keeps the message out of every owner-facing read until an operator
  // sends it (architecture §5).
  readonly status?: CsMessageStatus | undefined
  readonly now: Date
}

// Promote an AI draft to a sent assistant message. The body may differ from the
// draft's when an operator edits before sending; created_at is re-stamped so the
// owner's cursor poll delivers it as a fresh message.
export type SendDraftInput = {
  // The conversation the draft must belong to. The id alone is not enough: a
  // route takes it from the request body, so without this the caller's audit
  // record, read-marking, and touch would attribute to one conversation while
  // the message landed in another.
  readonly conversationId: string
  readonly messageId: string
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
  // Admin-only: exclude `draft` rows from the transcript. The console reviews a
  // pending draft through its own surface (getLatestPendingDraft), not the
  // append-only stream — a draft's created_at is re-stamped on send, so leaving
  // it in the cursor stream would let the dedup-by-id client miss the sent copy.
  // Defaults to false so the full admin list still returns drafts.
  readonly sentOnly?: boolean | undefined
}

export interface CsMessageStore {
  appendMessage(input: CsMessageInsert): Promise<AdminFacingMessage>
  // Owner reads exclude `draft` rows; admin reads include them so the console
  // can review pending AI drafts.
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
  // The most recent un-sent AI draft in a conversation, for the console review
  // surface. Undefined when there is none.
  getLatestPendingDraft(
    conversationId: string
  ): Promise<AdminFacingMessage | undefined>
  // Send an AI draft (optionally edited) to the owner. Returns the sent message,
  // or undefined if the id is not a pending draft of that conversation (already
  // sent, discarded, or belonging to a different conversation).
  sendDraft(input: SendDraftInput): Promise<AdminFacingMessage | undefined>
  // Discard a single draft; returns whether a draft row was removed. Scoped to
  // the conversation for the same reason as sendDraft.
  discardDraft(conversationId: string, messageId: string): Promise<boolean>
  // Discard every pending draft in a conversation — used before composing a
  // fresh draft so at most one pending draft exists at a time. (Handing off to
  // human keeps the pending draft editable, so it is not cleared there.)
  discardPendingDrafts(conversationId: string): Promise<number>
}

const adminMessageRowSchema = z.object({
  id: z.string(),
  sender: z.enum(["owner", "assistant"]),
  authorKind: z.enum(["user", "ai", "admin"]),
  status: z.enum(["sent", "draft"]),
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
  status,
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
//
// `ownerVisibleOnly` excludes `draft` rows — the single guard the owner-facing
// reads share so a draft can never leak through list, cursor, or unread paths.
async function readMessagePage(
  queryable: Queryable,
  input: ListMessagesInput,
  ownerVisibleOnly: boolean
): Promise<readonly AdminFacingMessage[]> {
  const limit = pageLimit(input.limit)
  const draftFilter = ownerVisibleOnly ? "AND status = 'sent'" : ""
  if (input.after === undefined) {
    const rows = await queryable.query(
      `SELECT ${adminMessageProjection}
         FROM cs_messages
        WHERE conversation_id = ?
          ${draftFilter}
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
        ${draftFilter}
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
      const status = input.status ?? "sent"
      await queryable.execute(
        `INSERT INTO cs_messages (
           id, conversation_id, sender, author_kind, status, author_admin_id,
           body, created_at, owner_read_at, admin_read_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
        [
          input.id,
          input.conversationId,
          input.sender,
          input.authorKind,
          status,
          input.authorAdminId,
          input.body,
          now,
        ]
      )
      return {
        id: input.id,
        sender: input.sender,
        authorKind: input.authorKind,
        status,
        authorAdminId: input.authorAdminId,
        body: input.body,
        createdAt: now,
        ownerReadAt: null,
        adminReadAt: null,
      }
    },

    async listAdminMessages(input) {
      const messages = await readMessagePage(
        queryable,
        input,
        input.sentOnly === true
      )
      return { messages, nextCursor: nextCursorFor(messages) }
    },

    async listOwnerMessages(input) {
      const adminMessages = await readMessagePage(queryable, input, true)
      const messages = adminMessages.map(toOwnerMessage)
      return { messages, nextCursor: nextCursorFor(messages) }
    },

    async markOwnerRead(conversationId, now) {
      const result = await queryable.execute(
        `UPDATE cs_messages
            SET owner_read_at = ?
          WHERE conversation_id = ?
            AND sender = 'assistant'
            AND status = 'sent'
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
            AND status = 'sent'
            AND owner_read_at IS NULL`,
        [conversationId]
      )
      return z.coerce.number().parse(row?.["count"] ?? 0)
    },

    async getLatestPendingDraft(conversationId) {
      const row = await queryable.queryOne(
        `SELECT ${adminMessageProjection}
           FROM cs_messages
          WHERE conversation_id = ?
            AND status = 'draft'
          ORDER BY created_at DESC, id DESC
          LIMIT 1`,
        [conversationId]
      )
      return row === undefined ? undefined : toAdminMessage(row)
    },

    async sendDraft(input) {
      const now = input.now.toISOString()
      // Re-stamp created_at so the owner's cursor poll delivers the promoted
      // draft as a fresh message. Guarded on status='draft' so a double-send
      // (two operators, or a retry) flips exactly one row.
      const result = await queryable.execute(
        `UPDATE cs_messages
            SET status = 'sent', body = ?, created_at = ?
          WHERE id = ?
            AND conversation_id = ?
            AND status = 'draft'`,
        [input.body, now, input.messageId, input.conversationId]
      )
      if (result.changes === 0) {
        return undefined
      }
      const row = await queryable.queryOne(
        `SELECT ${adminMessageProjection}
           FROM cs_messages
          WHERE id = ?`,
        [input.messageId]
      )
      return row === undefined ? undefined : toAdminMessage(row)
    },

    async discardDraft(conversationId, messageId) {
      const result = await queryable.execute(
        `DELETE FROM cs_messages
          WHERE id = ?
            AND conversation_id = ?
            AND status = 'draft'`,
        [messageId, conversationId]
      )
      return result.changes > 0
    },

    async discardPendingDrafts(conversationId) {
      const result = await queryable.execute(
        `DELETE FROM cs_messages WHERE conversation_id = ? AND status = 'draft'`,
        [conversationId]
      )
      return result.changes
    },
  }
}
