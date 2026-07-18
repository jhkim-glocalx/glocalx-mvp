import type {
  ActivityStage,
  ActivityTrail,
  CsMessageContext,
} from "@glocalx/domain/support/contracts"
import { z } from "zod"

import type { Queryable } from "../types.ts"
import { jsonColumnSchema, timestampSchema } from "./row-codecs.ts"

export type CsMessageContextInsert = {
  readonly id: string
  readonly messageId: string
  readonly context: CsMessageContext
  readonly capturedAt: Date
}

export type CsMessageContextRecord = {
  readonly id: string
  readonly messageId: string
  readonly section: string
  readonly stage: ActivityStage | null
  readonly activityTrail: ActivityTrail
  readonly capturedAt: string
}

export interface CsMessageContextStore {
  attachContext(input: CsMessageContextInsert): Promise<void>
  getContextForMessage(
    messageId: string
  ): Promise<CsMessageContextRecord | undefined>
  // Batch fetch for the operator conversation view: one query for a page of
  // messages instead of N per-message reads. Only owner messages carry context.
  getContextsForMessages(
    messageIds: readonly string[]
  ): Promise<ReadonlyMap<string, CsMessageContextRecord>>
}

// The trail was validated against the domain schema at write time; on read we
// parse the JSON column loosely and trust that shape (the cast is the seam).
const contextRowSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  section: z.string(),
  stage: z.string().nullable(),
  activityTrail: jsonColumnSchema(z.array(z.unknown())),
  capturedAt: timestampSchema,
})

const contextProjection = `
  id,
  message_id AS "messageId",
  section,
  stage,
  activity_trail_json AS "activityTrail",
  captured_at AS "capturedAt"
`

function toContextRecord(row: unknown): CsMessageContextRecord {
  const parsed = contextRowSchema.parse(row)
  return {
    ...parsed,
    stage: parsed.stage as ActivityStage | null,
    activityTrail: parsed.activityTrail as ActivityTrail,
  }
}

export function createDatabaseCsMessageContextStore(
  queryable: Queryable
): CsMessageContextStore {
  return {
    async attachContext(input) {
      await queryable.execute(
        `INSERT INTO cs_message_context (
           id, message_id, section, stage, activity_trail_json, captured_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          input.id,
          input.messageId,
          input.context.section,
          input.context.stage ?? null,
          JSON.stringify(input.context.activityTrail),
          input.capturedAt.toISOString(),
        ]
      )
    },

    async getContextForMessage(messageId) {
      const row = await queryable.queryOne(
        `SELECT ${contextProjection}
           FROM cs_message_context
          WHERE message_id = ?`,
        [messageId]
      )
      return row === undefined ? undefined : toContextRecord(row)
    },

    async getContextsForMessages(messageIds) {
      const byMessageId = new Map<string, CsMessageContextRecord>()
      if (messageIds.length === 0) {
        return byMessageId
      }
      const placeholders = messageIds.map(() => "?").join(", ")
      const rows = await queryable.query(
        `SELECT ${contextProjection}
           FROM cs_message_context
          WHERE message_id IN (${placeholders})`,
        [...messageIds]
      )
      for (const row of rows) {
        const record = toContextRecord(row)
        byMessageId.set(record.messageId, record)
      }
      return byMessageId
    },
  }
}
