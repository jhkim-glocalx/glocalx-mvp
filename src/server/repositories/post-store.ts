import type {
  CurrentLocation,
  PostPreview,
  PublishHistoryItem,
  StoredPostDraft,
  StoreProfile,
} from "@/posts/post-types"
import type { Queryable } from "@/server/db"

import {
  readPostCurrentLocation,
  readPostStoreProfile,
  readStoredPostDraft,
  upsertStoredPostDraft,
} from "./post-store-drafts"
import {
  countFailedPostPublishAttempts,
  readNextPostPublishAttemptNumber,
  readPostAttemptByIdempotencyKey,
  readPostPublishHistory,
  recordSuccessfulPostPublishAttempt,
} from "./post-store-publishing"

export interface PostStore {
  readStore(storeId: string): Promise<StoreProfile>
  readCurrentLocation(storeId: string): Promise<CurrentLocation>
  readDraft(draftId: string): Promise<StoredPostDraft>
  readPublishHistory(draftId: string): Promise<readonly PublishHistoryItem[]>
  readAttemptByIdempotencyKey(
    idempotencyKey: string
  ): Promise<PublishHistoryItem | undefined>
  countFailedAttempts(draftId: string): Promise<number>
  readNextAttemptNumber(draftId: string): Promise<number>
  upsertDraft(options: {
    readonly draftId: string
    readonly now: Date
    readonly ownerIntent: string
    readonly preview: PostPreview
    readonly revisionOfDraftId?: string
    readonly storeId: string
    readonly targetChannel: "GBP"
  }): Promise<void>
  recordSuccessfulPublishAttempt(options: {
    readonly attemptNumber: number
    readonly draftId: string
    readonly gbpPostId: string
    readonly idempotencyKey: string
    readonly now: Date
    readonly publicUrl: string
  }): Promise<void>
}

export function createDatabasePostStore(queryable: Queryable): PostStore {
  return {
    countFailedAttempts(draftId) {
      return countFailedPostPublishAttempts(queryable, draftId)
    },

    readAttemptByIdempotencyKey(idempotencyKey) {
      return readPostAttemptByIdempotencyKey(queryable, idempotencyKey)
    },

    readCurrentLocation(storeId) {
      return readPostCurrentLocation(queryable, storeId)
    },

    readDraft(draftId) {
      return readStoredPostDraft(queryable, draftId)
    },

    readNextAttemptNumber(draftId) {
      return readNextPostPublishAttemptNumber(queryable, draftId)
    },

    readPublishHistory(draftId) {
      return readPostPublishHistory(queryable, draftId)
    },

    readStore(storeId) {
      return readPostStoreProfile(queryable, storeId)
    },

    recordSuccessfulPublishAttempt(options) {
      return recordSuccessfulPostPublishAttempt(queryable, options)
    },

    upsertDraft(options) {
      return upsertStoredPostDraft(queryable, options)
    },
  }
}
