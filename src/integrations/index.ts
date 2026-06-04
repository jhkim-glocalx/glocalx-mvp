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
  createStubBusinessInformation,
  createStubClock,
  createStubContentGeneration,
  createStubGoogleOAuth,
  createStubJobScheduler,
  createStubLocalPosts,
  createStubNaverSearch,
  createStubReviews,
  createStubTranslation,
} from "./stub"

export function createIntegrationAdapters(
  options: CreateIntegrationAdaptersOptions = {}
): IntegrationAdapters {
  const env = options.env ?? process.env
  const mode =
    env["APP_INTEGRATION_MODE"] === "production" ? "production" : "stub"
  const now = options.now ?? new Date("2026-06-04T00:00:00.000Z")

  if (mode === "production") {
    return {
      mode,
      naverSearch: createProductionNaverSearch(env),
      googleOAuth: createProductionGoogleOAuth(env),
      gbpBusinessInformation: createProductionBusinessInformation(env),
      gbpLocalPosts: createProductionLocalPosts(env),
      gbpReviews: createProductionReviews(env),
      contentGeneration: createStubContentGeneration(),
      translation: createStubTranslation(),
      clock: createStubClock(now),
      jobScheduler: createStubJobScheduler(),
    }
  }

  return {
    mode,
    naverSearch: createStubNaverSearch(options.database),
    googleOAuth: createStubGoogleOAuth(),
    gbpBusinessInformation: createStubBusinessInformation(),
    gbpLocalPosts: createStubLocalPosts(),
    gbpReviews: createStubReviews(),
    contentGeneration: createStubContentGeneration(),
    translation: createStubTranslation(),
    clock: createStubClock(now),
    jobScheduler: createStubJobScheduler(),
  }
}
