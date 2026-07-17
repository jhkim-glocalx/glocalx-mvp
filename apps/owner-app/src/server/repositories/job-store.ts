import type { Queryable } from "@glocalx/db"
import { z } from "zod"

export type JobRunType = "GBP_FOLLOW_UP" | "POST_PUBLISH_RETRY" | "REVIEW_SYNC"
export type JobRunStatus = "SCHEDULED" | "RUNNING" | "SUCCEEDED" | "FAILED"

export type JobRunRecord = {
  readonly id: string
  readonly attempts: number
  readonly createdAt: string
  readonly idempotencyKey: string
  readonly runAfter: string
  readonly status: JobRunStatus
  readonly storeId: string
  readonly type: JobRunType
  readonly updatedAt: string
}

export interface JobStore {
  upsertJobRun(record: JobRunRecord): Promise<void>
  readJobRun(id: string): Promise<JobRunRecord | undefined>
  readJobRunByIdempotencyKey(
    idempotencyKey: string
  ): Promise<JobRunRecord | undefined>
  updateJobRunStatus(options: {
    readonly attempts: number
    readonly id: string
    readonly status: JobRunStatus
    readonly updatedAt: string
  }): Promise<JobRunRecord | undefined>
}

const timestampSchema = z.union([z.string(), z.date()]).transform((value) => {
  return value instanceof Date ? value.toISOString() : value
})

const jobRunRowSchema = z.object({
  attempts: z.number(),
  createdAt: timestampSchema,
  id: z.string(),
  idempotencyKey: z.string(),
  runAfter: timestampSchema,
  status: z.enum(["SCHEDULED", "RUNNING", "SUCCEEDED", "FAILED"]),
  storeId: z.string(),
  type: z.enum(["GBP_FOLLOW_UP", "POST_PUBLISH_RETRY", "REVIEW_SYNC"]),
  updatedAt: timestampSchema,
})

function toJobRun(row: unknown): JobRunRecord {
  return jobRunRowSchema.parse(row)
}

const jobRunProjection = `
  id,
  store_id AS "storeId",
  job_type AS "type",
  status,
  idempotency_key AS "idempotencyKey",
  run_after AS "runAfter",
  attempts,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`

export function createDatabaseJobStore(queryable: Queryable): JobStore {
  return {
    async readJobRun(id) {
      const row = await queryable.queryOne(
        `SELECT ${jobRunProjection} FROM job_runs WHERE id = ?`,
        [id]
      )
      return row === undefined ? undefined : toJobRun(row)
    },

    async readJobRunByIdempotencyKey(idempotencyKey) {
      const row = await queryable.queryOne(
        `SELECT ${jobRunProjection} FROM job_runs WHERE idempotency_key = ?`,
        [idempotencyKey]
      )
      return row === undefined ? undefined : toJobRun(row)
    },

    async updateJobRunStatus(options) {
      const row = await queryable.queryOne(
        `UPDATE job_runs
          SET status = ?, attempts = ?, updated_at = ?
          WHERE id = ?
          RETURNING ${jobRunProjection}`,
        [options.status, options.attempts, options.updatedAt, options.id]
      )
      return row === undefined ? undefined : toJobRun(row)
    },

    async upsertJobRun(record) {
      await queryable.execute(
        `INSERT INTO job_runs (
          id,
          store_id,
          job_type,
          status,
          idempotency_key,
          run_after,
          attempts,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          store_id = excluded.store_id,
          job_type = excluded.job_type,
          status = excluded.status,
          idempotency_key = excluded.idempotency_key,
          run_after = excluded.run_after,
          attempts = excluded.attempts,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at`,
        [
          record.id,
          record.storeId,
          record.type,
          record.status,
          record.idempotencyKey,
          record.runAfter,
          record.attempts,
          record.createdAt,
          record.updatedAt,
        ]
      )
    },
  }
}
