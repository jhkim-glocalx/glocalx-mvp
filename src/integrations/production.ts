import {
  blockedByCredentials,
  googleBusinessManageScope,
  missingEnvVars,
} from "./credentials"
import type {
  AdapterEnvironment,
  AdapterResult,
  GbpBusinessInformationAdapter,
  GbpLocalPostsAdapter,
  GbpReviewsAdapter,
  GoogleOAuthAdapter,
  HttpRequestSpec,
  NaverSearchAdapter,
} from "./contracts"

const naverEnvVars = ["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"] as const
const googleEnvVars = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const

function googleHeaders(accessToken: string): Readonly<Record<string, string>> {
  return {
    Authorization: `Bearer ${accessToken}`,
  }
}

function googleBlockedResult(
  env: AdapterEnvironment
): AdapterResult<HttpRequestSpec> {
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

export function createProductionNaverSearch(
  env: AdapterEnvironment
): NaverSearchAdapter {
  return {
    searchLocal(input) {
      const missing = missingEnvVars(env, naverEnvVars)
      if (missing.length > 0) {
        return blockedByCredentials(missing)
      }

      const url = new URL("https://openapi.naver.com/v1/search/local.json")
      url.searchParams.set("query", input.query)
      url.searchParams.set("display", String(input.display))
      url.searchParams.set("start", "1")
      url.searchParams.set("sort", "random")

      return {
        kind: "ok",
        value: {
          method: "GET",
          url: url.toString(),
          headers: {
            "X-Naver-Client-Id": env["NAVER_CLIENT_ID"] ?? "",
            "X-Naver-Client-Secret": env["NAVER_CLIENT_SECRET"] ?? "",
          },
        },
      }
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

export function createProductionBusinessInformation(
  env: AdapterEnvironment
): GbpBusinessInformationAdapter {
  return {
    createLocation(input) {
      const blocked = googleBlockedResult(env)
      if (blocked.kind === "blocked_by_credentials") {
        return blocked
      }

      const url = new URL(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${input.accountName}/locations`
      )
      url.searchParams.set("requestId", input.requestId)
      url.searchParams.set("validateOnly", "false")

      return {
        kind: "ok",
        value: {
          method: "POST",
          url: url.toString(),
          headers: googleHeaders(input.accessToken),
          requiredScopes: [googleBusinessManageScope],
          body: input.location,
        },
      }
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
