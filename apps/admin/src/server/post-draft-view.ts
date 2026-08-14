import type { PostDraftQueueEntry } from "@glocalx/db/support/post-draft-store"

// Wire shape for the read-only owner self-serve drafts list, mirroring
// queue-view.ts's QueueEntryView so the API route and the page never drift.
export type PostDraftEntryView = {
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

export function toPostDraftEntryView(
  entry: PostDraftQueueEntry
): PostDraftEntryView {
  return {
    id: entry.id,
    storeId: entry.storeId,
    storeName: entry.storeName,
    ownerIntent: entry.ownerIntent,
    targetChannel: entry.targetChannel,
    status: entry.status,
    koreanCopy: entry.koreanCopy,
    englishCopy: entry.englishCopy,
    createdAt: entry.createdAt,
    attemptCount: entry.attemptCount,
    latestAttemptStatus: entry.latestAttemptStatus,
    latestAttemptPublicUrl: entry.latestAttemptPublicUrl,
  }
}
