import type { AdapterBusinessProfileCandidate } from "@/domain/schemas"
import type { SqliteDatabase } from "@/server/db/sqlite"

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
}

export type NaverSearchResult = {
  readonly candidates: readonly AdapterBusinessProfileCandidate[]
}

export type CreateLocationInput = {
  readonly accessToken: string
  readonly accountName: string
  readonly requestId: string
  readonly location: Readonly<Record<string, unknown>>
}

export type CreateLocalPostInput = {
  readonly accessToken: string
  readonly parent: string
  readonly summary: string
}

export type ListReviewsInput = {
  readonly accessToken: string
  readonly parent: string
  readonly pageSize: number
  readonly pageToken?: string
}

export type UpdateReplyInput = {
  readonly accessToken: string
  readonly reviewName: string
  readonly comment: string
}

export interface NaverSearchAdapter {
  searchLocal(
    input: NaverSearchInput
  ): AdapterResult<NaverSearchResult | HttpRequestSpec>
}

export interface GoogleOAuthAdapter {
  connect(): AdapterResult<{ readonly subjectId: string }>
}

export interface GbpBusinessInformationAdapter {
  createLocation(input: CreateLocationInput): AdapterResult<HttpRequestSpec>
}

export interface GbpLocalPostsAdapter {
  createLocalPost(input: CreateLocalPostInput): AdapterResult<HttpRequestSpec>
}

export interface GbpReviewsAdapter {
  listReviews(input: ListReviewsInput): AdapterResult<HttpRequestSpec>
  updateReply(input: UpdateReplyInput): AdapterResult<HttpRequestSpec>
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
  readonly gbpReviews: GbpReviewsAdapter
  readonly contentGeneration: ContentGenerationAdapter
  readonly translation: TranslationAdapter
  readonly clock: ClockAdapter
  readonly jobScheduler: JobSchedulerAdapter
}

export type CreateIntegrationAdaptersOptions = {
  readonly env?: AdapterEnvironment
  readonly database?: SqliteDatabase
  readonly now?: Date
}
