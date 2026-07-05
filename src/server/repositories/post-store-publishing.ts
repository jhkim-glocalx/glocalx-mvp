import { stableId } from "@/posts/post-repository"
import type { PublishHistoryItem } from "@/posts/post-types"
import type { Queryable } from "@/server/db"
import { z } from "zod"

type RecordSuccessfulPostPublishAttemptOptions = {
  readonly attemptNumber: number
  readonly draftId: string
  readonly gbpPostId: string
  readonly idempotencyKey: string
  readonly now: Date
  readonly publicUrl: string
}

const countSchema = z
  .union([z.number(), z.string(), z.bigint()])
  .transform((value) => Number(value))

const attemptRowSchema = z.object({
  attemptNumber: z.number(),
  gbpPostId: z.string().nullable(),
  publicUrl: z.string().nullable(),
  status: z.enum(["REQUESTED", "SUCCEEDED", "FAILED"]),
})

const countRowSchema = z.object({
  count: countSchema,
})

const attemptProjection = `
  attempt_number AS "attemptNumber",
  status,
  gbp_post_id AS "gbpPostId",
  public_url AS "publicUrl"
`

function toAttempt(row: unknown): PublishHistoryItem {
  return attemptRowSchema.parse(row)
}

async function readCount(
  queryable: Queryable,
  sql: string,
  id: string
): Promise<number> {
  const row = countRowSchema.parse(await queryable.queryOne(sql, [id]))
  return row.count
}

export function countFailedPostPublishAttempts(
  queryable: Queryable,
  draftId: string
): Promise<number> {
  return readCount(
    queryable,
    "SELECT COUNT(*) AS count FROM post_publish_attempts WHERE draft_id = ? AND status = 'FAILED'",
    draftId
  )
}

export async function readPostAttemptByIdempotencyKey(
  queryable: Queryable,
  idempotencyKey: string
): Promise<PublishHistoryItem | undefined> {
  const row = await queryable.queryOne(
    `SELECT ${attemptProjection} FROM post_publish_attempts WHERE idempotency_key = ?`,
    [idempotencyKey]
  )
  return row === undefined ? undefined : toAttempt(row)
}

export async function readNextPostPublishAttemptNumber(
  queryable: Queryable,
  draftId: string
): Promise<number> {
  const count = await readCount(
    queryable,
    "SELECT COUNT(*) AS count FROM post_publish_attempts WHERE draft_id = ?",
    draftId
  )
  return count + 1
}

export async function readPostPublishHistory(
  queryable: Queryable,
  draftId: string
): Promise<readonly PublishHistoryItem[]> {
  const rows = await queryable.query(
    `SELECT ${attemptProjection}
      FROM post_publish_attempts
      WHERE draft_id = ?
      ORDER BY attempt_number ASC`,
    [draftId]
  )
  return rows.map(toAttempt)
}

export async function recordSuccessfulPostPublishAttempt(
  queryable: Queryable,
  options: RecordSuccessfulPostPublishAttemptOptions
): Promise<void> {
  await queryable.transaction(async (transaction) => {
    await transaction.execute(
      `INSERT INTO post_publish_attempts (
        id, draft_id, idempotency_key, attempt_number, status, gbp_post_id,
        public_url, error_code, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(idempotency_key) DO NOTHING`,
      [
        stableId("post-attempt", options.idempotencyKey),
        options.draftId,
        options.idempotencyKey,
        options.attemptNumber,
        "SUCCEEDED",
        options.gbpPostId,
        options.publicUrl,
        null,
        options.now.toISOString(),
      ]
    )
    await transaction.execute(
      "UPDATE post_drafts SET status = 'PUBLISHED' WHERE id = ?",
      [options.draftId]
    )
  })
}
