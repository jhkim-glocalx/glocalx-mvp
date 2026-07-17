import type {
  CurrentLocation,
  GbpPublishingCredentials,
  PostPreview,
  PublishAttemptReservation,
  PublishHistoryItem,
  StoredPostDraft,
  StoreProfile,
} from "@/posts/post-types"
import type { MarketingPlatform } from "@/integrations/contracts"
import type { Queryable } from "@glocalx/db"

import {
  readPostCurrentLocation,
  readGbpPublishingCredentials,
  readPostStoreProfile,
  readStoredPostDraft,
  readStoredPostDraftMedia,
  upsertStoredPostDraft,
} from "./post-store-drafts"
import {
  completePostPublishAttempt,
  countFailedPostPublishAttempts,
  failPostPublishAttempt,
  readPostPublishHistory,
  releasePostPublishAttempt,
  reservePostPublishAttempt,
} from "./post-store-publishing"

export interface PostStore {
  readStore(storeId: string): Promise<StoreProfile>
  readCurrentLocation(storeId: string): Promise<CurrentLocation>
  readGbpPublishingCredentials(
    storeId: string
  ): Promise<GbpPublishingCredentials | undefined>
  readDraft(
    draftId: string,
    storeId: string
  ): Promise<StoredPostDraft | undefined>
  readDraftMedia(draftId: string): Promise<StoredPostDraft | undefined>
  readPublishHistory(
    draftId: string,
    platform: MarketingPlatform
  ): Promise<readonly PublishHistoryItem[]>
  countFailedAttempts(
    draftId: string,
    platform: MarketingPlatform
  ): Promise<number>
  reservePublishAttempt(options: {
    readonly draftId: string
    readonly idempotencyKey: string
    readonly now: Date
    readonly platform: MarketingPlatform
    readonly storeId: string
  }): Promise<PublishAttemptReservation>
  upsertDraft(options: {
    readonly draftId: string
    readonly now: Date
    readonly ownerIntent: string
    readonly preview: PostPreview
    readonly revisionOfDraftId?: string
    readonly storeId: string
    readonly targetChannel: MarketingPlatform
  }): Promise<void>
  completePublishAttempt(options: {
    readonly draftId: string
    readonly externalPostId: string
    readonly idempotencyKey: string
    readonly platform: MarketingPlatform
    readonly publicUrl: string
    readonly storeId: string
  }): Promise<void>
  failPublishAttempt(options: {
    readonly draftId: string
    readonly idempotencyKey: string
    readonly platform: MarketingPlatform
  }): Promise<void>
  releasePublishAttempt(options: {
    readonly draftId: string
    readonly idempotencyKey: string
    readonly platform: MarketingPlatform
  }): Promise<void>
}

export function createDatabasePostStore(queryable: Queryable): PostStore {
  return {
    countFailedAttempts(draftId, platform) {
      return countFailedPostPublishAttempts(queryable, draftId, platform)
    },

    readCurrentLocation(storeId) {
      return readPostCurrentLocation(queryable, storeId)
    },

    readGbpPublishingCredentials(storeId) {
      return readGbpPublishingCredentials(queryable, storeId)
    },

    readDraft(draftId, storeId) {
      return readStoredPostDraft(queryable, draftId, storeId)
    },

    readDraftMedia(draftId) {
      return readStoredPostDraftMedia(queryable, draftId)
    },

    readPublishHistory(draftId, platform) {
      return readPostPublishHistory(queryable, draftId, platform)
    },

    readStore(storeId) {
      return readPostStoreProfile(queryable, storeId)
    },

    completePublishAttempt(options) {
      return completePostPublishAttempt(queryable, options)
    },

    failPublishAttempt(options) {
      return failPostPublishAttempt(queryable, options)
    },

    reservePublishAttempt(options) {
      return reservePostPublishAttempt(queryable, options)
    },

    releasePublishAttempt(options) {
      return releasePostPublishAttempt(queryable, options)
    },

    upsertDraft(options) {
      return upsertStoredPostDraft(queryable, options)
    },
  }
}
