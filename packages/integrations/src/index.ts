import type {
  CreateIntegrationAdaptersOptions,
  IntegrationAdapters,
} from "./contracts"
import {
  createProductionBusinessInformation,
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
import { createProductionPerformance } from "./production-performance"
import { shouldUsePreviewNaverStub } from "./runtime-diagnostics"
import {
  createStubOnboardingConversation,
  createStubPostingConversation,
} from "./stub-conversation"
import {
  createStubBusinessInformation,
  createStubClock,
  createStubContentGeneration,
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
import { createStubPerformance } from "./stub-performance"

export function createIntegrationAdapters(
  options: CreateIntegrationAdaptersOptions = {}
): IntegrationAdapters {
  const env = options.env ?? process.env
  const mode =
    env["APP_INTEGRATION_MODE"] === "production" ? "production" : "stub"
  const now = options.now ?? new Date("2026-06-04T00:00:00.000Z")
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
      instagramPosts: createProductionInstagramPosts(env, fetchImpl),
      contentGeneration: createStubContentGeneration(),
      marketingGeneration: createProductionMarketingGeneration(env, fetchImpl),
      onboardingConversation: createProductionOnboardingConversation(
        env,
        fetchImpl
      ),
      postingConversation: createProductionPostingConversation(env, fetchImpl),
      translation: createStubTranslation(),
      clock: createStubClock(now),
      jobScheduler: createStubJobScheduler(),
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
    instagramPosts: createStubInstagramPosts(),
    contentGeneration: createStubContentGeneration(),
    marketingGeneration: createStubMarketingGeneration(),
    onboardingConversation: createStubOnboardingConversation(),
    postingConversation: createStubPostingConversation(),
    translation: createStubTranslation(),
    clock: createStubClock(now),
    jobScheduler: createStubJobScheduler(),
  }
}
