import type { PublishJob } from "@glocalx/domain/campaign-contracts"
import {
  publishJobMaxAttempts,
  type PublishChannel,
  type PublishJobStatus,
} from "@glocalx/domain/campaign-state-machine"
import { z } from "zod"

import type { Queryable } from "../types.ts"
import { timestampSchema } from "./row-codecs.ts"

// The idempotency key is derived, never supplied: (request, channel) is exactly
// the grain the unique index enforces, so a retry structurally reuses the key
// rather than relying on a caller to thread the same string through. This is
// architecture.md §2's "idempotency key held constant across attempts".
export function publishJobIdempotencyKey(
  requestId: string,
  channel: PublishChannel
): string {
  return `publish-${channel}-${requestId}`
}

export type ReservePublishJobInput = {
  // Used only when this is the channel's first attempt and a row must be created.
  readonly id: string
  readonly requestId: string
  readonly channel: PublishChannel
  readonly now: Date
}

// Four outcomes, and only `reserved` means "go call the channel". The other
// three are all reasons a caller must not re-post: the channel already went
// live, another run holds it, or the operator has spent every attempt.
export type ReservePublishJobResult =
  | { readonly kind: "reserved"; readonly job: PublishJob }
  | { readonly kind: "replay"; readonly job: PublishJob }
  | { readonly kind: "in_progress"; readonly job: PublishJob }
  | { readonly kind: "retry_limit"; readonly job: PublishJob }

export type CompletePublishJobInput = {
  readonly requestId: string
  readonly channel: PublishChannel
  readonly externalRef: string
  readonly now: Date
}

export type FailPublishJobInput = {
  readonly requestId: string
  readonly channel: PublishChannel
  // A controlled, caller-authored summary — never a raw adapter error, which
  // can carry a request URL and therefore a token.
  readonly error: string
  readonly now: Date
}

export interface PublishJobStore {
  listPublishJobs(requestId: string): Promise<readonly PublishJob[]>
  // One read for the owner's whole status list — otherwise rendering N requests
  // costs N queries just to show a channel badge on each.
  listPublishJobsForStore(storeId: string): Promise<readonly PublishJob[]>
  reservePublishJob(
    input: ReservePublishJobInput
  ): Promise<ReservePublishJobResult>
  // Both settle calls are guarded on the job still being `publishing`, so a
  // late response from an abandoned run can't overwrite a newer attempt.
  completePublishJob(
    input: CompletePublishJobInput
  ): Promise<PublishJob | undefined>
  failPublishJob(input: FailPublishJobInput): Promise<PublishJob | undefined>
}

export const publishJobLastErrorMaxLength = 500

const publishJobRowSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  channel: z.string(),
  status: z.string(),
  externalRef: z.string().nullable(),
  attemptCount: z.coerce.number().int(),
  lastError: z.string().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

// idempotency_key is intentionally absent: it is the server's replay guard and
// has no reader outside this module.
const publishJobProjection = `
  id,
  request_id AS "requestId",
  channel,
  status,
  external_ref AS "externalRef",
  attempt_count AS "attemptCount",
  last_error AS "lastError",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`

// Table-qualified twin for the store-wide read's join against campaign_requests.
const joinedPublishJobProjection = `
  job.id,
  job.request_id AS "requestId",
  job.channel,
  job.status,
  job.external_ref AS "externalRef",
  job.attempt_count AS "attemptCount",
  job.last_error AS "lastError",
  job.created_at AS "createdAt",
  job.updated_at AS "updatedAt"
`

function toPublishJob(row: unknown): PublishJob {
  const parsed = publishJobRowSchema.parse(row)
  return {
    ...parsed,
    channel: parsed.channel as PublishChannel,
    status: parsed.status as PublishJobStatus,
  }
}

async function readJob(
  queryable: Queryable,
  requestId: string,
  channel: PublishChannel
): Promise<PublishJob | undefined> {
  const row = await queryable.queryOne(
    `SELECT ${publishJobProjection}
       FROM publish_jobs
      WHERE request_id = ? AND channel = ?`,
    [requestId, channel]
  )
  return row === undefined ? undefined : toPublishJob(row)
}

export function createDatabasePublishJobStore(
  queryable: Queryable
): PublishJobStore {
  return {
    async listPublishJobs(requestId) {
      const rows = await queryable.query(
        `SELECT ${publishJobProjection}
           FROM publish_jobs
          WHERE request_id = ?
          ORDER BY channel ASC`,
        [requestId]
      )
      return rows.map(toPublishJob)
    },

    async listPublishJobsForStore(storeId) {
      const rows = await queryable.query(
        `SELECT ${joinedPublishJobProjection}
           FROM publish_jobs job
           JOIN campaign_requests request ON request.id = job.request_id
          WHERE request.store_id = ?
          ORDER BY job.request_id ASC, job.channel ASC`,
        [storeId]
      )
      return rows.map(toPublishJob)
    },

    async reservePublishJob(input) {
      const now = input.now.toISOString()
      let result: ReservePublishJobResult | undefined

      // Read-then-write on a row whose unique index is the only other guard, so
      // the whole decision runs in one transaction: without it two operators
      // clicking Publish together could both read "failed" and both reserve.
      await queryable.transaction(async (transaction) => {
        const existing = await readJob(
          transaction,
          input.requestId,
          input.channel
        )

        if (existing === undefined) {
          await transaction.execute(
            `INSERT INTO publish_jobs (
               id, request_id, channel, status, external_ref, attempt_count,
               last_error, idempotency_key, created_at, updated_at
             ) VALUES (?, ?, ?, 'publishing', NULL, 1, NULL, ?, ?, ?)`,
            [
              input.id,
              input.requestId,
              input.channel,
              publishJobIdempotencyKey(input.requestId, input.channel),
              now,
              now,
            ]
          )
          result = {
            kind: "reserved",
            job: {
              id: input.id,
              requestId: input.requestId,
              channel: input.channel,
              status: "publishing",
              externalRef: null,
              attemptCount: 1,
              lastError: null,
              createdAt: now,
              updatedAt: now,
            },
          }
          return
        }

        if (existing.status === "published") {
          result = { kind: "replay", job: existing }
          return
        }
        if (existing.status === "publishing") {
          result = { kind: "in_progress", job: existing }
          return
        }
        if (existing.attemptCount >= publishJobMaxAttempts) {
          result = { kind: "retry_limit", job: existing }
          return
        }

        const updated = await transaction.execute(
          `UPDATE publish_jobs
              SET status = 'publishing',
                  attempt_count = attempt_count + 1,
                  updated_at = ?
            WHERE id = ? AND status = ?`,
          [now, existing.id, existing.status]
        )
        if (updated.changes === 0) {
          result = { kind: "in_progress", job: existing }
          return
        }

        result = {
          kind: "reserved",
          job: {
            ...existing,
            status: "publishing",
            attemptCount: existing.attemptCount + 1,
            updatedAt: now,
          },
        }
      })

      if (result === undefined) {
        throw new Error(
          `Publish job reservation produced no outcome for request "${input.requestId}" channel "${input.channel}".`
        )
      }
      return result
    },

    async completePublishJob(input) {
      const now = input.now.toISOString()
      const updated = await queryable.execute(
        `UPDATE publish_jobs
            SET status = 'published',
                external_ref = ?,
                last_error = NULL,
                updated_at = ?
          WHERE request_id = ? AND channel = ? AND status = 'publishing'`,
        [input.externalRef, now, input.requestId, input.channel]
      )
      return updated.changes === 0
        ? undefined
        : readJob(queryable, input.requestId, input.channel)
    },

    async failPublishJob(input) {
      const now = input.now.toISOString()
      const updated = await queryable.execute(
        `UPDATE publish_jobs
            SET status = 'failed',
                last_error = ?,
                updated_at = ?
          WHERE request_id = ? AND channel = ? AND status = 'publishing'`,
        [
          input.error.slice(0, publishJobLastErrorMaxLength),
          now,
          input.requestId,
          input.channel,
        ]
      )
      return updated.changes === 0
        ? undefined
        : readJob(queryable, input.requestId, input.channel)
    },
  }
}
