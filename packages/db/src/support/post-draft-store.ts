import { z } from "zod"

import type { Queryable } from "../types.ts"
import { timestampSchema } from "./row-codecs.ts"

// Read-only: the admin app only needs visibility into owner self-serve
// drafts (direct publish is paused, see the owner-app publish route), not a
// write path. Kept separate from campaign-store.ts — post_drafts/
// post_publish_attempts is a distinct pipeline from campaign_requests.
export type PostDraftQueueEntry = {
  readonly id: string
  readonly storeId: string
  readonly storeName: string
  readonly ownerIntent: string
  readonly targetChannel: string
  readonly status: string
  readonly koreanCopy: string
  readonly englishCopy: string
  readonly createdAt: string
  readonly attemptCount: number
  readonly latestAttemptStatus: string | null
  readonly latestAttemptPublicUrl: string | null
}

export interface PostDraftStore {
  // Operator read spans every store, so this takes no storeId — same shape
  // as CampaignStore.listCampaignQueue.
  listPostDraftsForOperator(): Promise<readonly PostDraftQueueEntry[]>
}

const postDraftQueueEntryRowSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  storeName: z.string(),
  ownerIntent: z.string(),
  targetChannel: z.string(),
  status: z.string(),
  koreanCopy: z.string(),
  englishCopy: z.string(),
  createdAt: timestampSchema,
  attemptCount: z.coerce.number(),
  latestAttemptStatus: z.string().nullable(),
  latestAttemptPublicUrl: z.string().nullable(),
})

export function createDatabasePostDraftStore(
  queryable: Queryable
): PostDraftStore {
  return {
    async listPostDraftsForOperator() {
      const rows = await queryable.query(
        `SELECT
            d.id,
            d.store_id AS "storeId",
            s.name AS "storeName",
            d.owner_intent AS "ownerIntent",
            d.target_channel AS "targetChannel",
            d.status,
            d.korean_copy AS "koreanCopy",
            d.english_copy AS "englishCopy",
            d.created_at AS "createdAt",
            (SELECT COUNT(*) FROM post_publish_attempts a WHERE a.draft_id = d.id) AS "attemptCount",
            (SELECT a.status FROM post_publish_attempts a
              WHERE a.draft_id = d.id ORDER BY a.created_at DESC LIMIT 1) AS "latestAttemptStatus",
            (SELECT a.public_url FROM post_publish_attempts a
              WHERE a.draft_id = d.id ORDER BY a.created_at DESC LIMIT 1) AS "latestAttemptPublicUrl"
          FROM post_drafts d
          JOIN stores s ON s.id = d.store_id
          ORDER BY d.created_at DESC`
      )
      return rows.map((row) => postDraftQueueEntryRowSchema.parse(row))
    },
  }
}
