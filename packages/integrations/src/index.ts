import type {
  CreateIntegrationAdaptersOptions,
  IntegrationAdapters,
} from "./contracts"
import {
  createProductionBusinessInformation,
  createProductionGbpVerifications,
  createProductionGoogleOAuth,
  createProductionLocalPosts,
  createProductionNaverSearch,
  createProductionReviews,
} from "./production"
import {
  createProductionOnboardingConversation,
  createProductionPostingConversation,
} from "./openai-conversation"
import { createProductionMarketingGeneration } from "./openai-production"
import { createProductionGeocoding } from "./geocoding-production"
import { createProductionCsAssistant } from "./openai-cs-assistant"
import { createSystemClock } from "./clock"
import { createProductionPerformance } from "./production-performance"
import {
  shouldUsePreviewMediaStoreStub,
  shouldUsePreviewNaverStub,
} from "./runtime-diagnostics"
import { createProductionMediaStore } from "./vercel-blob-production"
import { StubMediaStore } from "./media-store"
import {
  createStubOnboardingConversation,
  createStubPostingConversation,
} from "./stub-conversation"
import { createStubCsAssistant } from "./stub-cs-assistant"
import {
  createStubBusinessInformation,
  createStubClock,
  createStubContentGeneration,
  createStubGbpVerifications,
  createStubGeocoding,
  createStubGoogleOAuth,
  createStubJobScheduler,
  createStubLocalPosts,
  createStubMarketingGeneration,
  createStubNaverSearch,
  createStubReviews,
  createStubTranslation,
} from "./stub"
import {
  createProductionInstagramPosts,
  createStubInstagramPosts,
} from "./instagram"
import {
  createProductionInstagramOAuth,
  createStubInstagramOAuth,
} from "./instagram-oauth"
import { createStubPerformance } from "./stub-performance"

export function createIntegrationAdapters(
  options: CreateIntegrationAdaptersOptions = {}
): IntegrationAdapters {
  const env = options.env ?? process.env
  const mode =
    env["APP_INTEGRATION_MODE"] === "production" ? "production" : "stub"
  // Time is real unless a caller pins it. A hard-coded default here used to
  // reach production and persist a fixed date as real row timestamps, so the
  // frozen clock is now opt-in: only an explicit `options.now` selects it.
  const clock =
    options.now === undefined
      ? createSystemClock()
      : createStubClock(options.now)
  const fetchImpl = options.fetchImpl ?? globalThis.fetch

  if (mode === "production") {
    // Production mode assembles real external adapters while keeping deterministic stubs for services not yet backed by live credentials or network contracts.
    return {
      mode,
      // Preview and development deployments may run production Google/OpenAI paths before Naver credentials exist, so only Naver falls back to the stub.
      naverSearch: shouldUsePreviewNaverStub(env)
        ? createStubNaverSearch()
        : createProductionNaverSearch(env, fetchImpl),
      googleOAuth: createProductionGoogleOAuth(env),
      gbpBusinessInformation: createProductionBusinessInformation(env),
      gbpLocalPosts: createProductionLocalPosts(env, fetchImpl),
      gbpPerformance: createProductionPerformance(env),
      gbpReviews: createProductionReviews(env),
      gbpVerifications: createProductionGbpVerifications(env),
      geocoding: createProductionGeocoding(env, fetchImpl),
      instagramPosts: createProductionInstagramPosts(env, fetchImpl),
      instagramOAuth: createProductionInstagramOAuth(env, fetchImpl),
      contentGeneration: createStubContentGeneration(),
      marketingGeneration: createProductionMarketingGeneration(env, fetchImpl),
      onboardingConversation: createProductionOnboardingConversation(
        env,
        fetchImpl
      ),
      postingConversation: createProductionPostingConversation(env, fetchImpl),
      csAssistant: createProductionCsAssistant(env, fetchImpl),
      translation: createStubTranslation(),
      clock,
      jobScheduler: createStubJobScheduler(),
      // Preview/dev deployments may lack a provisioned Blob store, same rationale as the Naver fallback above.
      mediaStore: shouldUsePreviewMediaStoreStub(env)
        ? new StubMediaStore()
        : createProductionMediaStore(env),
    }
  }

  return {
    mode,
    naverSearch: createStubNaverSearch(),
    googleOAuth: createStubGoogleOAuth(),
    gbpBusinessInformation: createStubBusinessInformation(),
    gbpLocalPosts: createStubLocalPosts(),
    gbpPerformance: createStubPerformance(),
    gbpReviews: createStubReviews(),
    gbpVerifications: createStubGbpVerifications(),
    geocoding: createStubGeocoding(),
    instagramPosts: createStubInstagramPosts(),
    instagramOAuth: createStubInstagramOAuth(),
    contentGeneration: createStubContentGeneration(),
    marketingGeneration: createStubMarketingGeneration(),
    onboardingConversation: createStubOnboardingConversation(),
    postingConversation: createStubPostingConversation(),
    csAssistant: createStubCsAssistant(),
    translation: createStubTranslation(),
    clock,
    jobScheduler: createStubJobScheduler(),
    mediaStore: new StubMediaStore(),
  }
}

export * from "./media-store"
