import type { LocationStatus } from "@/domain/location-status"
import type {
  IntegrationAdapters,
  MarketingGenerationResult,
  MarketingImageAssetInput,
  MarketingPlatform,
  MarketingSuggestionMode,
} from "@/integrations/contracts"
import type { PostStore } from "@/server/repositories/post-store"

export type CreatePostDraftOptions = {
  readonly acceptedSuggestionId?: string
  readonly adapters: IntegrationAdapters
  readonly imageAssets?: readonly MarketingImageAssetInput[]
  readonly ownerIntent: string
  readonly postStore: PostStore
  readonly storeId: string
  readonly suggestionMode?: MarketingSuggestionMode
  readonly targetChannel: MarketingPlatform
}

export type RevisePostDraftOptions = CreatePostDraftOptions & {
  readonly originalDraftId: string
}

export type PublishPostDraftOptions = {
  readonly adapters: IntegrationAdapters
  readonly draftId: string
  readonly idempotencyKey?: string
  readonly postStore: PostStore
  readonly storeId: string
  readonly targetChannel: MarketingPlatform
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
  readonly preview: PostPreview | null
}

export type MarketingGenerationStatus =
  | { readonly kind: "stub" | "ready" }
  | {
      readonly kind: "blocked_by_credentials"
      readonly missingEnvVars: readonly string[]
    }

export type PostPreview = Partial<MarketingGenerationResult> & {
  readonly canPublish: boolean
  readonly koreanCopy: string
  readonly englishCopy: string
  readonly generationStatus?: MarketingGenerationStatus
  readonly sourceImages?: readonly MarketingImageAssetInput[]
}

export type GbpPublishingCredentials = {
  readonly accessToken: string
  readonly parent: string
}

export type PostDraftResult = {
  readonly status: "DRAFT_READY"
  readonly draftId: string
  readonly revisionOfDraftId?: string
  readonly preview: PostPreview
}

export type PublishHistoryItem = {
  readonly attemptNumber: number
  readonly externalPostId: string | null
  readonly platform: MarketingPlatform
  readonly status: "REQUESTED" | "SUCCEEDED" | "FAILED"
  readonly publicUrl: string | null
}

export type PublishAttemptReservation =
  | {
      readonly kind: "reserved"
      readonly attempt: PublishHistoryItem
    }
  | {
      readonly kind: "replay"
      readonly attempt: PublishHistoryItem
    }
  | { readonly kind: "conflict" | "in_progress" | "not_found" }

export type PublishPostResult =
  | {
      readonly status: "PUBLISHED"
      readonly draftId: string
      readonly externalPostId: string
      readonly platform: MarketingPlatform
      readonly publicUrl: string
      readonly attemptNumber: number
      readonly history: readonly PublishHistoryItem[]
    }
  | {
      readonly status: "BLOCKED"
      readonly code:
        | "GBP_PUBLISH_NOT_CONFIGURED"
        | "INSTAGRAM_PUBLISH_NOT_CONFIGURED"
        | "DRAFT_NOT_FOUND"
        | "IDEMPOTENCY_KEY_CONFLICT"
        | "PUBLISH_IN_PROGRESS"
        | "PUBLISH_FAILED"
        | "LOCATION_NOT_VERIFIED"
      readonly message: string
    }
  | {
      readonly status: "MANUAL_PUBLISH_REQUIRED"
      readonly code: "POST_PUBLISH_RETRY_LIMIT"
      readonly message: string
    }
