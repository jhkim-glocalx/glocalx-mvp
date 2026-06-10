import { Buffer } from "node:buffer"

import { z } from "zod"

import { locationStatusSchema } from "@/domain/location-status"
import type { SqliteDatabase } from "@/server/db/sqlite"

import type {
  CurrentLocation,
  PostPreview,
  PublishHistoryItem,
  StoredPostDraft,
  StoreProfile,
} from "./post-types"

const storeRowSchema = z.object({
  name: z.string(),
  address: z.string(),
})

const locationRowSchema = z.object({
  status: locationStatusSchema,
  google_location_id: z.string().nullable(),
})

const draftRowSchema = z.object({
  id: z.string(),
  korean_copy: z.string(),
  english_copy: z.string(),
  marketing_preview_json: z.string().nullable().optional(),
})

const attemptRowSchema = z.object({
  attempt_number: z.number(),
  status: z.enum(["REQUESTED", "SUCCEEDED", "FAILED"]),
  gbp_post_id: z.string().nullable(),
  public_url: z.string().nullable(),
})

const countRowSchema = z.object({
  count: z.number(),
})

type InsertDraftOptions = {
  readonly database: SqliteDatabase
  readonly draftId: string
  readonly now: Date
  readonly ownerIntent: string
  readonly preview: PostPreview
  readonly revisionOfDraftId?: string
  readonly storeId: string
  readonly targetChannel: "GBP"
}

type InsertSuccessfulPublishAttemptOptions = {
  readonly database: SqliteDatabase
  readonly draftId: string
  readonly gbpPostId: string
  readonly idempotencyKey: string
  readonly attemptNumber: number
  readonly publicUrl: string
  readonly now: Date
}

export function stableId(prefix: string, value: string): string {
  const encoded = Buffer.from(value).toString("base64url").slice(0, 24)
  return `${prefix}-${encoded}`
}

export function getStore(
  database: SqliteDatabase,
  storeId: string
): StoreProfile {
  return storeRowSchema.parse(
    database
      .prepare("SELECT name, address FROM stores WHERE id = ?")
      .get(storeId)
  )
}

export function getCurrentLocation(
  database: SqliteDatabase,
  storeId: string
): CurrentLocation {
  const row = database
    .prepare(
      "SELECT status, google_location_id FROM gbp_locations WHERE store_id = ? ORDER BY CASE WHEN id = 'setup-gbp-location' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1"
    )
    .get(storeId)

  if (row === undefined) {
    return { status: "DISCOVERED", googleLocationId: null }
  }

  const parsed = locationRowSchema.parse(row)
  return {
    status: parsed.status,
    googleLocationId: parsed.google_location_id,
  }
}

export function getDraft(
  database: SqliteDatabase,
  draftId: string
): StoredPostDraft {
  const parsed = draftRowSchema.parse(
    database
      .prepare(
        "SELECT id, korean_copy, english_copy, marketing_preview_json FROM post_drafts WHERE id = ?"
      )
      .get(draftId)
  )
  return {
    id: parsed.id,
    koreanCopy: parsed.korean_copy,
    englishCopy: parsed.english_copy,
    preview:
      parsed.marketing_preview_json === null ||
      parsed.marketing_preview_json === undefined
        ? null
        : (JSON.parse(parsed.marketing_preview_json) as PostPreview),
  }
}

export function getPublishHistory(
  database: SqliteDatabase,
  draftId: string
): readonly PublishHistoryItem[] {
  return database
    .prepare(
      "SELECT attempt_number, status, gbp_post_id, public_url FROM post_publish_attempts WHERE draft_id = ? ORDER BY attempt_number ASC"
    )
    .all(draftId)
    .map((row) => {
      const parsed = attemptRowSchema.parse(row)
      return {
        attemptNumber: parsed.attempt_number,
        status: parsed.status,
        gbpPostId: parsed.gbp_post_id,
        publicUrl: parsed.public_url,
      }
    })
}

export function getAttemptByIdempotencyKey(
  database: SqliteDatabase,
  idempotencyKey: string
): PublishHistoryItem | undefined {
  const row = database
    .prepare(
      "SELECT attempt_number, status, gbp_post_id, public_url FROM post_publish_attempts WHERE idempotency_key = ?"
    )
    .get(idempotencyKey)

  if (row === undefined) {
    return undefined
  }

  const parsed = attemptRowSchema.parse(row)
  return {
    attemptNumber: parsed.attempt_number,
    status: parsed.status,
    gbpPostId: parsed.gbp_post_id,
    publicUrl: parsed.public_url,
  }
}

export function failedAttemptCount(
  database: SqliteDatabase,
  draftId: string
): number {
  const row = countRowSchema.parse(
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM post_publish_attempts WHERE draft_id = ? AND status = 'FAILED'"
      )
      .get(draftId)
  )
  return row.count
}

export function nextAttemptNumber(
  database: SqliteDatabase,
  draftId: string
): number {
  const row = countRowSchema.parse(
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM post_publish_attempts WHERE draft_id = ?"
      )
      .get(draftId)
  )
  return row.count + 1
}

export function insertDraft(options: InsertDraftOptions): void {
  options.database
    .prepare(
      "INSERT OR REPLACE INTO post_drafts (id, store_id, owner_intent, target_channel, status, korean_copy, english_copy, created_at, revision_of_draft_id, marketing_preview_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      options.draftId,
      options.storeId,
      options.ownerIntent,
      options.targetChannel,
      "DRAFT",
      options.preview.koreanCopy,
      options.preview.englishCopy,
      options.now.toISOString(),
      options.revisionOfDraftId ?? null,
      JSON.stringify(options.preview)
    )
}

export function insertSuccessfulPublishAttempt(
  options: InsertSuccessfulPublishAttemptOptions
): void {
  options.database
    .prepare(
      "INSERT OR REPLACE INTO post_publish_attempts (id, draft_id, idempotency_key, attempt_number, status, gbp_post_id, public_url, error_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      stableId("post-attempt", options.idempotencyKey),
      options.draftId,
      options.idempotencyKey,
      options.attemptNumber,
      "SUCCEEDED",
      options.gbpPostId,
      options.publicUrl,
      null,
      options.now.toISOString()
    )
}

export function markDraftPublished(
  database: SqliteDatabase,
  draftId: string
): void {
  database
    .prepare("UPDATE post_drafts SET status = 'PUBLISHED' WHERE id = ?")
    .run(draftId)
}
