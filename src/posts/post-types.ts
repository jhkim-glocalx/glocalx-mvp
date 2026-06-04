import type { LocationStatus } from "@/domain/location-status"
import type { IntegrationAdapters } from "@/integrations/contracts"
import type { SqliteDatabase } from "@/server/db/sqlite"

export type CreatePostDraftOptions = {
  readonly adapters: IntegrationAdapters
  readonly database: SqliteDatabase
  readonly ownerIntent: string
  readonly storeId: string
  readonly targetChannel: "GBP"
}

export type RevisePostDraftOptions = CreatePostDraftOptions & {
  readonly originalDraftId: string
}

export type PublishPostDraftOptions = {
  readonly adapters: IntegrationAdapters
  readonly database: SqliteDatabase
  readonly draftId: string
  readonly idempotencyKey?: string
  readonly storeId: string
}

export type StoreProfile = {
  readonly name: string
  readonly address: string
}

export type CurrentLocation = {
  readonly status: LocationStatus
  readonly googleLocationId: string | null
}

export type StoredPostDraft = {
  readonly id: string
  readonly koreanCopy: string
  readonly englishCopy: string
}

export type PostPreview = {
  readonly canPublish: boolean
  readonly koreanCopy: string
  readonly englishCopy: string
}

export type PostDraftResult = {
  readonly status: "DRAFT_READY"
  readonly draftId: string
  readonly revisionOfDraftId?: string
  readonly preview: PostPreview
}

export type PublishHistoryItem = {
  readonly attemptNumber: number
  readonly status: "REQUESTED" | "SUCCEEDED" | "FAILED"
  readonly gbpPostId: string | null
  readonly publicUrl: string | null
}

export type PublishPostResult =
  | {
      readonly status: "PUBLISHED"
      readonly draftId: string
      readonly gbpPostId: string
      readonly publicUrl: string
      readonly attemptNumber: number
      readonly history: readonly PublishHistoryItem[]
    }
  | {
      readonly status: "BLOCKED"
      readonly code: "LOCATION_NOT_VERIFIED"
      readonly message: string
    }
  | {
      readonly status: "MANUAL_PUBLISH_REQUIRED"
      readonly code: "POST_PUBLISH_RETRY_LIMIT"
      readonly message: string
    }
