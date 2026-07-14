import type { MarketingPlatform } from "@/integrations/contracts"
import { stableId } from "@/posts/post-repository"
import type {
  PublishAttemptReservation,
  PublishHistoryItem,
} from "@/posts/post-types"
import type { Queryable } from "@/server/db"
import { z } from "zod"

type ReservePostPublishAttemptOptions = {
  readonly draftId: string
  readonly idempotencyKey: string
  readonly now: Date
  readonly platform: MarketingPlatform
  readonly storeId: string
}

type CompletePostPublishAttemptOptions = {
  readonly draftId: string
  readonly externalPostId: string
  readonly idempotencyKey: string
  readonly platform: MarketingPlatform
  readonly publicUrl: string
  readonly storeId: string
}

const countSchema = z
  .union([z.number(), z.string(), z.bigint()])
  .transform((value) => Number(value))

const attemptRowSchema = z.object({
  attemptNumber: z.number(),
  externalPostId: z.string().nullable(),
  platform: z.enum(["GBP", "INSTAGRAM"]),
  publicUrl: z.string().nullable(),
  status: z.enum(["REQUESTED", "SUCCEEDED", "FAILED"]),
})

const reservedAttemptRowSchema = attemptRowSchema.extend({
  draftId: z.string(),
  storeId: z.string(),
})

const countRowSchema = z.object({ count: countSchema })

const attemptProjection = `
  attempt.attempt_number AS "attemptNumber",
  attempt.status,
  attempt.platform,
  COALESCE(attempt.external_post_id, attempt.gbp_post_id) AS "externalPostId",
  attempt.public_url AS "publicUrl"
`

function toAttempt(row: unknown): PublishHistoryItem {
  return attemptRowSchema.parse(row)
}

export function countFailedPostPublishAttempts(
  queryable: Queryable,
  draftId: string,
  platform: MarketingPlatform
): Promise<number> {
  return queryable
    .queryOne(
      "SELECT COUNT(*) AS count FROM post_publish_attempts WHERE draft_id = ? AND platform = ? AND status = 'FAILED'",
      [draftId, platform]
    )
    .then((row) => countRowSchema.parse(row).count)
}

export async function readPostPublishHistory(
  queryable: Queryable,
  draftId: string,
  platform: MarketingPlatform
): Promise<readonly PublishHistoryItem[]> {
  const rows = await queryable.query(
    `SELECT ${attemptProjection}
      FROM post_publish_attempts AS attempt
      WHERE attempt.draft_id = ? AND attempt.platform = ?
      ORDER BY attempt.attempt_number ASC`,
    [draftId, platform]
  )
  return rows.map(toAttempt)
}

export async function reservePostPublishAttempt(
  queryable: Queryable,
  options: ReservePostPublishAttemptOptions
): Promise<PublishAttemptReservation> {
  const result = await queryable.execute(
    `INSERT INTO post_publish_attempts (
      id, draft_id, idempotency_key, attempt_number, status, platform,
      external_post_id, gbp_post_id, public_url, error_code, created_at
    )
    SELECT ?, draft.id, ?,
      COALESCE((
        SELECT MAX(attempt.attempt_number)
        FROM post_publish_attempts AS attempt
        WHERE attempt.draft_id = draft.id AND attempt.platform = ?
      ), 0) + 1,
      'REQUESTED', ?, NULL, NULL, NULL, NULL, ?
    FROM post_drafts AS draft
    WHERE draft.id = ? AND draft.store_id = ?
    ON CONFLICT(idempotency_key) DO NOTHING`,
    [
      stableId("post-attempt", options.idempotencyKey),
      options.idempotencyKey,
      options.platform,
      options.platform,
      options.now.toISOString(),
      options.draftId,
      options.storeId,
    ]
  )

  const row = await queryable.queryOne(
    `SELECT ${attemptProjection}, attempt.draft_id AS "draftId",
      draft.store_id AS "storeId"
    FROM post_publish_attempts AS attempt
    JOIN post_drafts AS draft ON draft.id = attempt.draft_id
    WHERE attempt.idempotency_key = ?`,
    [options.idempotencyKey]
  )
  if (row === undefined) {
    return { kind: "not_found" }
  }

  const parsed = reservedAttemptRowSchema.parse(row)
  if (
    parsed.draftId !== options.draftId ||
    parsed.storeId !== options.storeId ||
    parsed.platform !== options.platform
  ) {
    return { kind: "conflict" }
  }
  const attempt = toAttempt(parsed)
  if (parsed.status === "SUCCEEDED") {
    return { attempt, kind: "replay" }
  }
  if (result.changes === 0) {
    return { kind: "in_progress" }
  }
  return { attempt, kind: "reserved" }
}

export async function completePostPublishAttempt(
  queryable: Queryable,
  options: CompletePostPublishAttemptOptions
): Promise<void> {
  await queryable.transaction(async (transaction) => {
    await transaction.execute(
      `UPDATE post_publish_attempts
      SET status = 'SUCCEEDED', external_post_id = ?, gbp_post_id = ?,
        public_url = ?, error_code = NULL
      WHERE idempotency_key = ? AND draft_id = ? AND platform = ?
        AND status = 'REQUESTED'`,
      [
        options.externalPostId,
        options.platform === "GBP" ? options.externalPostId : null,
        options.publicUrl,
        options.idempotencyKey,
        options.draftId,
        options.platform,
      ]
    )
    await transaction.execute(
      "UPDATE post_drafts SET status = 'PUBLISHED' WHERE id = ? AND store_id = ?",
      [options.draftId, options.storeId]
    )
  })
}

export async function failPostPublishAttempt(
  queryable: Queryable,
  options: Pick<
    CompletePostPublishAttemptOptions,
    "draftId" | "idempotencyKey" | "platform"
  >
): Promise<void> {
  await queryable.execute(
    `UPDATE post_publish_attempts
    SET status = 'FAILED', error_code = 'PROVIDER_ERROR'
    WHERE idempotency_key = ? AND draft_id = ? AND platform = ?
      AND status = 'REQUESTED'`,
    [options.idempotencyKey, options.draftId, options.platform]
  )
}

export async function releasePostPublishAttempt(
  queryable: Queryable,
  options: Pick<
    CompletePostPublishAttemptOptions,
    "draftId" | "idempotencyKey" | "platform"
  >
): Promise<void> {
  await queryable.execute(
    `DELETE FROM post_publish_attempts
    WHERE idempotency_key = ? AND draft_id = ? AND platform = ?
      AND status = 'REQUESTED'`,
    [options.idempotencyKey, options.draftId, options.platform]
  )
}
