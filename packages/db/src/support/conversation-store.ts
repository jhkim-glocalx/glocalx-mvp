import type {
  CsConversationMode,
  CsConversationStatus,
} from "@glocalx/domain/support/contracts"
import { z } from "zod"

import type { Queryable } from "../types.ts"
import { timestampSchema } from "./row-codecs.ts"

export type CsConversationRecord = {
  readonly id: string
  readonly storeId: string
  readonly mode: CsConversationMode
  readonly status: CsConversationStatus
  readonly assignedAdminId: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export type CreateOpenConversationInput = {
  readonly id: string
  readonly storeId: string
  readonly mode: CsConversationMode
  readonly now: Date
}

export interface CsConversationStore {
  getOpenConversationForStore(
    storeId: string
  ): Promise<CsConversationRecord | undefined>
  getOrCreateOpenConversation(
    input: CreateOpenConversationInput
  ): Promise<CsConversationRecord>
  getConversationForStore(
    conversationId: string,
    storeId: string
  ): Promise<CsConversationRecord | undefined>
  getConversationById(
    conversationId: string
  ): Promise<CsConversationRecord | undefined>
  listConversations(
    filter?: CsConversationListFilter
  ): Promise<readonly CsConversationRecord[]>
  assignAdmin(conversationId: string, adminId: string, now: Date): Promise<void>
  setMode(
    conversationId: string,
    mode: CsConversationMode,
    now: Date
  ): Promise<void>
  resolveConversation(conversationId: string, now: Date): Promise<void>
  touch(conversationId: string, now: Date): Promise<void>
}

export type CsConversationListFilter = {
  readonly status?: CsConversationStatus
}

const conversationRowSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  mode: z.enum(["ai", "human"]),
  status: z.enum(["open", "resolved"]),
  assignedAdminId: z.string().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

const conversationProjection = `
  id,
  store_id AS "storeId",
  mode,
  status,
  assigned_admin_id AS "assignedAdminId",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`

function toConversation(row: unknown): CsConversationRecord {
  return conversationRowSchema.parse(row)
}

async function readOpenConversationForStore(
  queryable: Queryable,
  storeId: string
): Promise<CsConversationRecord | undefined> {
  const row = await queryable.queryOne(
    `SELECT ${conversationProjection}
       FROM cs_conversations
      WHERE store_id = ? AND status = 'open'`,
    [storeId]
  )
  return row === undefined ? undefined : toConversation(row)
}

export function createDatabaseCsConversationStore(
  queryable: Queryable
): CsConversationStore {
  return {
    getOpenConversationForStore(storeId) {
      return readOpenConversationForStore(queryable, storeId)
    },

    async getOrCreateOpenConversation(input) {
      let conversation: CsConversationRecord | undefined
      // A transaction plus the partial-unique index (one open per store) makes
      // concurrent "first message" sends converge on a single conversation.
      await queryable.transaction(async (transaction) => {
        const existing = await readOpenConversationForStore(
          transaction,
          input.storeId
        )
        if (existing !== undefined) {
          conversation = existing
          return
        }
        const now = input.now.toISOString()
        await transaction.execute(
          `INSERT INTO cs_conversations (
             id, store_id, mode, status, assigned_admin_id, created_at, updated_at
           ) VALUES (?, ?, ?, 'open', NULL, ?, ?)`,
          [input.id, input.storeId, input.mode, now, now]
        )
        conversation = await readOpenConversationForStore(
          transaction,
          input.storeId
        )
      })
      if (conversation === undefined) {
        throw new CsConversationPersistenceError(
          "Failed to open a conversation for the store"
        )
      }
      return conversation
    },

    async getConversationForStore(conversationId, storeId) {
      const row = await queryable.queryOne(
        `SELECT ${conversationProjection}
           FROM cs_conversations
          WHERE id = ? AND store_id = ?`,
        [conversationId, storeId]
      )
      return row === undefined ? undefined : toConversation(row)
    },

    async getConversationById(conversationId) {
      const row = await queryable.queryOne(
        `SELECT ${conversationProjection}
           FROM cs_conversations
          WHERE id = ?`,
        [conversationId]
      )
      return row === undefined ? undefined : toConversation(row)
    },

    async listConversations(filter) {
      const status = filter?.status
      const rows =
        status === undefined
          ? await queryable.query(
              `SELECT ${conversationProjection}
                 FROM cs_conversations
                ORDER BY updated_at DESC, id ASC`
            )
          : await queryable.query(
              `SELECT ${conversationProjection}
                 FROM cs_conversations
                WHERE status = ?
                ORDER BY updated_at DESC, id ASC`,
              [status]
            )
      return rows.map(toConversation)
    },

    async assignAdmin(conversationId, adminId, now) {
      await queryable.execute(
        `UPDATE cs_conversations
            SET assigned_admin_id = ?, updated_at = ?
          WHERE id = ?`,
        [adminId, now.toISOString(), conversationId]
      )
    },

    async setMode(conversationId, mode, now) {
      await queryable.execute(
        `UPDATE cs_conversations
            SET mode = ?, updated_at = ?
          WHERE id = ?`,
        [mode, now.toISOString(), conversationId]
      )
    },

    async resolveConversation(conversationId, now) {
      await queryable.execute(
        `UPDATE cs_conversations
            SET status = 'resolved', updated_at = ?
          WHERE id = ?`,
        [now.toISOString(), conversationId]
      )
    },

    async touch(conversationId, now) {
      await queryable.execute(
        `UPDATE cs_conversations SET updated_at = ? WHERE id = ?`,
        [now.toISOString(), conversationId]
      )
    },
  }
}

export class CsConversationPersistenceError extends Error {
  readonly name = "CsConversationPersistenceError"
}
