import type { NextRequest } from "next/server"

import { onboardingExtractionRequestSchema } from "@/domain/schemas"
import type { BusinessProfileExtractionResult } from "@/onboarding/extraction"
import { extractBusinessProfile } from "@/onboarding/extraction"
import {
  parseJsonRoutePayload,
  readDatabaseSession,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"

type PublicExtractionResult =
  | Exclude<
      BusinessProfileExtractionResult,
      { readonly status: "NAVER_REQUEST_READY" }
    >
  | {
      readonly status: "NAVER_REQUEST_READY"
      readonly normalizedQuery: string
      readonly request: {
        readonly method: string
        readonly url: string
        readonly requiredHeaders: readonly string[]
      }
    }

function toPublicResult(
  result: BusinessProfileExtractionResult
): PublicExtractionResult {
  if (result.status !== "NAVER_REQUEST_READY") {
    return result
  }

  // Public previews expose the spec shape without credential-bearing headers.
  return {
    status: "NAVER_REQUEST_READY",
    normalizedQuery: result.normalizedQuery,
    request: {
      method: result.request.method,
      url: result.request.url,
      requiredHeaders: Object.keys(result.request.headers),
    },
  }
}

export async function POST(request: NextRequest) {
  const parsed = await parseJsonRoutePayload(
    request,
    onboardingExtractionRequestSchema
  )
  if (parsed.kind === "response") {
    return parsed.response
  }

  return withQueryableRouteDatabase(
    async ({ adapters, onboardingExtractionRepository, sessionStore }) => {
      // Extraction runs only for the store bound to the authenticated session.
      const session = await readDatabaseSession(request, sessionStore)
      if (session === undefined) {
        return requiredSessionResponse()
      }

      const result = await extractBusinessProfile({
        adapters,
        extractionRepository: onboardingExtractionRepository,
        input: parsed.value.input,
        storeId: session.storeId,
      })

      return Response.json(toPublicResult(result))
    }
  )
}
