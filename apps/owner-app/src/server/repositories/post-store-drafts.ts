import { locationStatusSchema } from "@/domain/location-status"
import type {
  CurrentLocation,
  GbpPublishingCredentials,
  PostPreview,
  StoredPostDraft,
  StoreProfile,
} from "@/posts/post-types"
import { decryptToken } from "@/auth/token-encryption"
import type { MarketingPlatform } from "@/integrations/contracts"
import type { Queryable } from "@/server/db"
import { z } from "zod"

type UpsertStoredPostDraftOptions = {
  readonly draftId: string
  readonly now: Date
  readonly ownerIntent: string
  readonly preview: PostPreview
  readonly revisionOfDraftId?: string
  readonly storeId: string
  readonly targetChannel: MarketingPlatform
}

const storeRowSchema = z.object({
  address: z.string(),
  name: z.string(),
})

const locationRowSchema = z.object({
  googleLocationId: z.string().nullable(),
  status: locationStatusSchema,
})

const publishingCredentialsRowSchema = z.object({
  accountName: z.string(),
  encryptedAccessToken: z.string(),
  googleLocationId: z.string(),
})

export async function readGbpPublishingCredentials(
  queryable: Queryable,
  storeId: string
): Promise<GbpPublishingCredentials | undefined> {
  const row = await queryable.queryOne(
    `SELECT account.account_name AS "accountName",
      connection.encrypted_access_token AS "encryptedAccessToken",
      location.google_location_id AS "googleLocationId"
    FROM gbp_locations AS location
    JOIN gbp_accounts AS account
      ON account.id = location.gbp_account_id AND account.store_id = location.store_id
    JOIN oauth_connections AS connection
      ON connection.store_id = location.store_id AND connection.provider = 'GOOGLE'
    WHERE location.store_id = ? AND location.status = 'VERIFIED'
      AND location.google_location_id IS NOT NULL
    ORDER BY connection.created_at DESC, location.updated_at DESC
    LIMIT 1`,
    [storeId]
  )
  if (row === undefined) {
    return undefined
  }
  const parsed = publishingCredentialsRowSchema.parse(row)
  const accessToken = decryptToken(parsed.encryptedAccessToken)
  if (accessToken === undefined) {
    return undefined
  }
  return {
    accessToken,
    parent: parsed.googleLocationId.startsWith("accounts/")
      ? parsed.googleLocationId
      : `${parsed.accountName}/${parsed.googleLocationId}`,
  }
}

const postPreviewSchema = z
  .object({
    canPublish: z.boolean(),
    englishCopy: z.string(),
    koreanCopy: z.string(),
  })
  .passthrough()

const previewJsonSchema = z
  .union([
    z.string().transform((value) => JSON.parse(value)),
    z.record(z.string(), z.unknown()),
  ])
  .transform((value) => postPreviewSchema.parse(value))

const draftRowSchema = z.object({
  englishCopy: z.string(),
  id: z.string(),
  koreanCopy: z.string(),
  marketingPreview: previewJsonSchema.nullable(),
})

export async function readPostStoreProfile(
  queryable: Queryable,
  storeId: string
): Promise<StoreProfile> {
  return storeRowSchema.parse(
    await queryable.queryOne("SELECT name, address FROM stores WHERE id = ?", [
      storeId,
    ])
  )
}

export async function readPostCurrentLocation(
  queryable: Queryable,
  storeId: string
): Promise<CurrentLocation> {
  const row = await queryable.queryOne(
    `SELECT status, google_location_id AS "googleLocationId"
      FROM gbp_locations
      WHERE store_id = ?
      ORDER BY CASE WHEN id = 'setup-gbp-location' THEN 0 ELSE 1 END, updated_at DESC
      LIMIT 1`,
    [storeId]
  )
  return row === undefined
    ? { googleLocationId: null, status: "DISCOVERED" }
    : locationRowSchema.parse(row)
}

export async function readStoredPostDraft(
  queryable: Queryable,
  draftId: string,
  storeId: string
): Promise<StoredPostDraft | undefined> {
  const row = await queryable.queryOne(
    `SELECT id, korean_copy AS "koreanCopy", english_copy AS "englishCopy",
        marketing_preview_json AS "marketingPreview"
        FROM post_drafts WHERE id = ? AND store_id = ?`,
    [draftId, storeId]
  )
  if (row === undefined) {
    return undefined
  }
  const parsed = draftRowSchema.parse(row)
  return {
    englishCopy: parsed.englishCopy,
    id: parsed.id,
    koreanCopy: parsed.koreanCopy,
    preview: parsed.marketingPreview,
  }
}

export async function readStoredPostDraftMedia(
  queryable: Queryable,
  draftId: string
): Promise<StoredPostDraft | undefined> {
  const row = await queryable.queryOne(
    `SELECT id, korean_copy AS "koreanCopy", english_copy AS "englishCopy",
      marketing_preview_json AS "marketingPreview"
    FROM post_drafts WHERE id = ?`,
    [draftId]
  )
  if (row === undefined) {
    return undefined
  }
  const parsed = draftRowSchema.parse(row)
  return {
    englishCopy: parsed.englishCopy,
    id: parsed.id,
    koreanCopy: parsed.koreanCopy,
    preview: parsed.marketingPreview,
  }
}

export async function upsertStoredPostDraft(
  queryable: Queryable,
  options: UpsertStoredPostDraftOptions
): Promise<void> {
  await queryable.execute(
    `INSERT INTO post_drafts (
      id, store_id, owner_intent, target_channel, status, korean_copy,
      english_copy, revision_of_draft_id, marketing_preview_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      store_id = excluded.store_id,
      owner_intent = excluded.owner_intent,
      target_channel = excluded.target_channel,
      status = excluded.status,
      korean_copy = excluded.korean_copy,
      english_copy = excluded.english_copy,
      revision_of_draft_id = excluded.revision_of_draft_id,
      marketing_preview_json = excluded.marketing_preview_json,
      created_at = excluded.created_at`,
    [
      options.draftId,
      options.storeId,
      options.ownerIntent,
      options.targetChannel,
      "DRAFT",
      options.preview.koreanCopy,
      options.preview.englishCopy,
      options.revisionOfDraftId ?? null,
      JSON.stringify(options.preview),
      options.now.toISOString(),
    ]
  )
}
