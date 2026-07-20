import type { AdapterBusinessProfileCandidate } from "@glocalx/domain"
import type { SqliteDatabase } from "@glocalx/db/sqlite"
import type {
  GbpBusinessInformationAdapter,
  GbpLocalPostsAdapter,
  GbpPerformanceAdapter,
  GbpReviewsAdapter,
} from "./gbp-contracts"
import type { MarketingGenerationAdapter } from "./marketing-contracts"
import type { InstagramPostsAdapter } from "./instagram-contracts"
import type {
  OnboardingConversationAdapter,
  PostingConversationAdapter,
} from "./conversation-contracts"
import type { CsAssistantAdapter } from "./cs-assistant-contracts"

export type {
  CreateLocalPostInput,
  CreateLocationInput,
  FetchGbpPerformanceInput,
  GbpBusinessInformationAdapter,
  GbpLocalPostsAdapter,
  GbpPerformanceAdapter,
  GbpPerformanceApiResponse,
  GbpPerformanceDailyMetric,
  GbpPerformanceDailyMetricTimeSeries,
  GbpPerformanceDailyRange,
  GbpPerformanceDate,
  GbpPerformanceDatedValue,
  GbpPerformancePeriod,
  GbpReviewsAdapter,
  GoogleLocationMatch,
  ListReviewsInput,
  RequestAdminRightsInput,
  SearchGoogleLocationsInput,
  SearchGoogleLocationsResult,
  UpdateReplyInput,
} from "./gbp-contracts"
export type {
  CreateInstagramPostInput,
  InstagramPostsAdapter,
} from "./instagram-contracts"
export type { PublishedSocialPost } from "./social-publishing-contracts"
export { gbpPerformanceDailyMetrics } from "./gbp-contracts"
export type {
  MarketingGenerationAdapter,
  MarketingGenerationInput,
  MarketingGenerationResult,
  MarketingCaptionTranslation,
  MarketingImageAssetInput,
  MarketingImageOutput,
  MarketingIntentAnalysis,
  MarketingPlatform,
  MarketingPlatformPreview,
  MarketingSuggestion,
  MarketingSuggestionMode,
  MarketingTranslationLocale,
} from "./marketing-contracts"
export type {
  OnboardingConversationAdapter,
  OnboardingNextPromptInput,
  OnboardingNextPromptOutput,
  OnboardingSlotExtractionInput,
  PostingConversationAdapter,
  PostingOwnerReplyInput,
} from "./conversation-contracts"
export type {
  CsAssistantAdapter,
  CsAssistantComposeInput,
  CsAssistantComposeOutput,
  CsAssistantTurn,
} from "./cs-assistant-contracts"

export type IntegrationMode = "stub" | "production"

export type AdapterEnvironment = Readonly<Record<string, string | undefined>>

export type BlockedByCredentials = {
  readonly kind: "blocked_by_credentials"
  readonly code: "BLOCKED_BY_CREDENTIALS"
  readonly missingEnvVars: readonly string[]
}

export type AdapterOk<TValue> = {
  readonly kind: "ok"
  readonly value: TValue
}

export type AdapterResult<TValue> = AdapterOk<TValue> | BlockedByCredentials

export type ExternalFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response>

export type NaverSearchUnavailableReason =
  | "HTTP_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT"

export class NaverSearchUnavailableError extends Error {
  readonly name = "NaverSearchUnavailableError"

  constructor(
    readonly reason: NaverSearchUnavailableReason,
    readonly status: number | undefined = undefined
  ) {
    super(
      status === undefined
        ? `Naver local search unavailable: ${reason}`
        : `Naver local search unavailable: ${reason} ${status}`
    )
  }
}

export type HttpMethod = "GET" | "POST" | "PUT"

export type HttpRequestSpec = {
  readonly method: HttpMethod
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly requiredScopes?: readonly string[]
  readonly body?: unknown
}

export type NaverSearchInput = {
  readonly query: string
  readonly display: number
  readonly rawInput?: string
}

export type NaverSearchResult = {
  readonly candidates: readonly AdapterBusinessProfileCandidate[]
}

export interface NaverSearchAdapter {
  searchLocal(
    input: NaverSearchInput
  ): Promise<AdapterResult<NaverSearchResult | HttpRequestSpec>>
}

export interface GoogleOAuthAdapter {
  connect(): AdapterResult<{ readonly subjectId: string }>
}

export interface ContentGenerationAdapter {
  generatePostCopy(
    intent: string
  ): AdapterResult<{ readonly korean: string; readonly english: string }>
}

export interface TranslationAdapter {
  translate(
    text: string,
    targetLanguage: string
  ): AdapterResult<{ readonly text: string }>
}

export interface ClockAdapter {
  now(): Date
}

export interface JobSchedulerAdapter {
  schedule(jobType: string): AdapterResult<{ readonly jobId: string }>
}

export type IntegrationAdapters = {
  readonly mode: IntegrationMode
  readonly naverSearch: NaverSearchAdapter
  readonly googleOAuth: GoogleOAuthAdapter
  readonly gbpBusinessInformation: GbpBusinessInformationAdapter
  readonly gbpLocalPosts: GbpLocalPostsAdapter
  readonly gbpPerformance: GbpPerformanceAdapter
  readonly gbpReviews: GbpReviewsAdapter
  readonly instagramPosts: InstagramPostsAdapter
  readonly contentGeneration: ContentGenerationAdapter
  readonly marketingGeneration: MarketingGenerationAdapter
  readonly onboardingConversation: OnboardingConversationAdapter
  readonly postingConversation: PostingConversationAdapter
  readonly csAssistant: CsAssistantAdapter
  readonly translation: TranslationAdapter
  readonly clock: ClockAdapter
  readonly jobScheduler: JobSchedulerAdapter
}

export type CreateIntegrationAdaptersOptions = {
  readonly env?: AdapterEnvironment
  readonly database?: SqliteDatabase
  readonly fetchImpl?: ExternalFetch
  readonly now?: Date
}
