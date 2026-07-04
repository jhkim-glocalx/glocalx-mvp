import type {
  CurrentLocation,
  PostPreview,
  PublishHistoryItem,
  StoredPostDraft,
  StoreProfile,
} from "@/posts/post-types"

export interface PostStore {
  readStore(storeId: string): StoreProfile
  readCurrentLocation(storeId: string): CurrentLocation
  readDraft(draftId: string): StoredPostDraft
  readPublishHistory(draftId: string): readonly PublishHistoryItem[]
  readAttemptByIdempotencyKey(
    idempotencyKey: string
  ): PublishHistoryItem | undefined
  countFailedAttempts(draftId: string): number
  readNextAttemptNumber(draftId: string): number
  upsertDraft(options: {
    readonly draftId: string
    readonly now: Date
    readonly ownerIntent: string
    readonly preview: PostPreview
    readonly revisionOfDraftId?: string
    readonly storeId: string
    readonly targetChannel: "GBP"
  }): void
  upsertSuccessfulPublishAttempt(options: {
    readonly attemptNumber: number
    readonly draftId: string
    readonly gbpPostId: string
    readonly idempotencyKey: string
    readonly now: Date
    readonly publicUrl: string
  }): void
  markDraftPublished(draftId: string): void
}
