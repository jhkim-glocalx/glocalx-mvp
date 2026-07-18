import type {
  ActivityAction,
  ActivityDetail,
  ActivitySection,
} from "@glocalx/domain/support/contracts"
import { z } from "zod"

import type { Queryable } from "../types.ts"
import { jsonColumnSchema, timestampSchema } from "./row-codecs.ts"

export const activityTimelineDefaultLimit = 100

export type ActivityEventInsert = {
  readonly id: string
  readonly storeId: string
  readonly sessionId: string | null
  readonly section: ActivitySection
  readonly action: ActivityAction
  readonly detail: ActivityDetail | undefined
  readonly occurredAt: Date
}

export type ActivityEventRecord = {
  readonly id: string
  readonly storeId: string
  readonly sessionId: string | null
  readonly section: string
  readonly action: string
  readonly detail: ActivityDetail
  readonly createdAt: string
}

export interface ActivityEventStore {
  recordEvents(events: readonly ActivityEventInsert[]): Promise<void>
  listEventsForStore(
    storeId: string,
    limit?: number
  ): Promise<readonly ActivityEventRecord[]>
}

const activityEventRowSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  sessionId: z.string().nullable(),
  section: z.string(),
  action: z.string(),
  detail: jsonColumnSchema(z.record(z.string(), z.unknown())),
  createdAt: timestampSchema,
})

const activityEventProjection = `
  id,
  store_id AS "storeId",
  session_id AS "sessionId",
  section,
  action,
  detail_json AS "detail",
  created_at AS "createdAt"
`

function toActivityEvent(row: unknown): ActivityEventRecord {
  const parsed = activityEventRowSchema.parse(row)
  return { ...parsed, detail: parsed.detail as ActivityDetail }
}

export function createDatabaseActivityEventStore(
  queryable: Queryable
): ActivityEventStore {
  return {
    async recordEvents(events) {
      if (events.length === 0) {
        return
      }
      // One transaction per flush keeps a partial batch from stranding
      // half a ring buffer in the timeline.
      await queryable.transaction(async (transaction) => {
        for (const event of events) {
          await transaction.execute(
            `INSERT INTO activity_events (
               id, store_id, session_id, section, action, detail_json, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              event.id,
              event.storeId,
              event.sessionId,
              event.section,
              event.action,
              JSON.stringify(event.detail ?? {}),
              event.occurredAt.toISOString(),
            ]
          )
        }
      })
    },

    async listEventsForStore(storeId, limit) {
      const effectiveLimit =
        limit === undefined || limit <= 0 ? activityTimelineDefaultLimit : limit
      const rows = await queryable.query(
        `SELECT ${activityEventProjection}
           FROM activity_events
          WHERE store_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT ?`,
        [storeId, effectiveLimit]
      )
      return rows.map(toActivityEvent)
    },
  }
}
