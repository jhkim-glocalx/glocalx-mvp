import {
  blockedByCredentials,
  googleBusinessManageScope,
  missingEnvVars,
} from "./credentials"
import type {
  AdapterEnvironment,
  AdapterResult,
  GbpLocalPostsAdapter,
  GbpReviewsAdapter,
  GoogleOAuthAdapter,
  HttpRequestSpec,
} from "./contracts"

export {
  buildNaverLocalSearchRequest,
  createProductionNaverSearch,
  naverEnvVars,
} from "./naver-production"

export {
  buildGoogleLocationCreateRequest,
  buildGoogleLocationSearchRequest,
  buildGoogleLocationValidationRequest,
  buildGoogleRequestAdminRightsRequest,
  createProductionBusinessInformation,
  GoogleBusinessProfileApiError,
} from "./production-business-information"

const googleEnvVars = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const

function googleHeaders(accessToken: string): Readonly<Record<string, string>> {
  return {
    Authorization: `Bearer ${accessToken}`,
  }
}

function googleBlockedResult(
  env: AdapterEnvironment
): AdapterResult<HttpRequestSpec> {
  // Production Google adapters block on app credentials before building owner-token request specs, keeping setup errors explicit and recoverable.
  const missing = missingEnvVars(env, googleEnvVars)
  if (missing.length > 0) {
    return blockedByCredentials(missing)
  }
  return {
    kind: "ok",
    value: {
      method: "GET",
      url: "about:blank",
      headers: {},
    },
  }
}

export function createProductionGoogleOAuth(
  env: AdapterEnvironment
): GoogleOAuthAdapter {
  return {
    connect() {
      const missing = missingEnvVars(env, googleEnvVars)
      if (missing.length > 0) {
        return blockedByCredentials(missing)
      }
      return { kind: "ok", value: { subjectId: "production-oauth-request" } }
    },
  }
}

export function createProductionLocalPosts(
  env: AdapterEnvironment
): GbpLocalPostsAdapter {
  return {
    createLocalPost(input) {
      const blocked = googleBlockedResult(env)
      if (blocked.kind === "blocked_by_credentials") {
        return blocked
      }

      return {
        kind: "ok",
        value: {
          method: "POST",
          url: `https://mybusiness.googleapis.com/v4/${input.parent}/localPosts`,
          headers: googleHeaders(input.accessToken),
          requiredScopes: [googleBusinessManageScope],
          body: { summary: input.summary },
        },
      }
    },
  }
}

export function createProductionReviews(
  env: AdapterEnvironment
): GbpReviewsAdapter {
  return {
    listReviews(input) {
      const blocked = googleBlockedResult(env)
      if (blocked.kind === "blocked_by_credentials") {
        return blocked
      }

      const url = new URL(
        `https://mybusiness.googleapis.com/v4/${input.parent}/reviews`
      )
      url.searchParams.set("pageSize", String(input.pageSize))
      if (input.pageToken !== undefined) {
        url.searchParams.set("pageToken", input.pageToken)
      }
      url.searchParams.set("orderBy", "updateTime desc")

      return {
        kind: "ok",
        value: {
          method: "GET",
          url: url.toString(),
          headers: googleHeaders(input.accessToken),
          requiredScopes: [googleBusinessManageScope],
        },
      }
    },
    updateReply(input) {
      const blocked = googleBlockedResult(env)
      if (blocked.kind === "blocked_by_credentials") {
        return blocked
      }

      return {
        kind: "ok",
        value: {
          method: "PUT",
          url: `https://mybusiness.googleapis.com/v4/${input.reviewName}/reply`,
          headers: googleHeaders(input.accessToken),
          requiredScopes: [googleBusinessManageScope],
          body: { comment: input.comment },
        },
      }
    },
  }
}
