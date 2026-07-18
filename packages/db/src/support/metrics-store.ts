import type {
  MetricsActivityEvent,
  MetricsConversation,
  MetricsMessage,
  WeeklyKillMetricsInput,
  WeeklyMetricsWindow,
} from "@glocalx/domain/support/metrics"
import { z } from "zod"

import type { Queryable } from "../types.ts"
import { timestampSchema } from "./row-codecs.ts"

// This store only GATHERS the rows the kill-metric computation needs; the
// windowing and math live in @glocalx/domain/support/metrics (pure and
// unit-tested there). The db package depends on domain for types only
// (erased at runtime) — the admin app owns the runtime compose step, keeping
// persistence and pure logic on their own sides of the boundary.
export interface SupportMetricsStore {
  gatherWeeklyMetricsInput(
    window: WeeklyMetricsWindow
  ): Promise<WeeklyKillMetricsInput>
}

const activityRowSchema = z.object({
  storeId: z.string(),
  occurredAt: timestampSchema,
})

const messageRowSchema = z.object({
  conversationId: z.string(),
  sender: z.enum(["owner", "assistant"]),
  createdAt: timestampSchema,
})

const conversationRowSchema = z.object({
  createdAt: timestampSchema,
})

export function createDatabaseSupportMetricsStore(
  queryable: Queryable
): SupportMetricsStore {
  return {
    async gatherWeeklyMetricsInput(window) {
      // Activity events and conversations are bounded by the window end;
      // messages are loaded in full because a median-response pair can straddle
      // the window start (the assistant prompt may predate it). At cohort scale
      // this read is small; a growing corpus would add a lookback bound here.
      const activityRows = await queryable.query(
        `SELECT store_id AS "storeId", created_at AS "occurredAt"
           FROM activity_events
          WHERE created_at < ?`,
        [window.end]
      )
      const messageRows = await queryable.query(
        `SELECT conversation_id AS "conversationId", sender,
                created_at AS "createdAt"
           FROM cs_messages
          WHERE created_at < ?
          ORDER BY conversation_id ASC, created_at ASC, id ASC`,
        [window.end]
      )
      const conversationRows = await queryable.query(
        `SELECT created_at AS "createdAt"
           FROM cs_conversations
          WHERE created_at < ?`,
        [window.end]
      )

      const activityEvents: MetricsActivityEvent[] = activityRows.map((row) =>
        activityRowSchema.parse(row)
      )
      const messages: MetricsMessage[] = messageRows.map((row) =>
        messageRowSchema.parse(row)
      )
      const conversations: MetricsConversation[] = conversationRows.map((row) =>
        conversationRowSchema.parse(row)
      )

      return { window, activityEvents, messages, conversations }
    },
  }
}
