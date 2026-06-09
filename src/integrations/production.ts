import {
  blockedByCredentials,
  googleBusinessManageScope,
  missingEnvVars,
} from "./credentials"
import type {
  AdapterEnvironment,
  AdapterResult,
  CreateLocationInput,
  GbpBusinessInformationAdapter,
  GbpLocalPostsAdapter,
  GbpReviewsAdapter,
  GoogleOAuthAdapter,
  HttpMethod,
  HttpRequestSpec,
  RequestAdminRightsInput,
  SearchGoogleLocationsInput,
} from "./contracts"

export {
  buildNaverLocalSearchRequest,
  createProductionNaverSearch,
} from "./naver-production"

const googleEnvVars = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const
const googleBusinessInformationBaseUrl =
  "https://mybusinessbusinessinformation.googleapis.com/v1"

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

function buildGoogleRequestSpec(options: {
  readonly accessToken: string
  readonly body?: unknown
  readonly method: HttpMethod
  readonly url: string
}): HttpRequestSpec {
  return {
    method: options.method,
    url: options.url,
    headers: googleHeaders(options.accessToken),
    requiredScopes: [googleBusinessManageScope],
    ...(options.body === undefined ? {} : { body: options.body }),
  }
}

export function buildGoogleLocationSearchRequest(
  input: SearchGoogleLocationsInput
): HttpRequestSpec {
  return buildGoogleRequestSpec({
    accessToken: input.accessToken,
    body: { location: input.location },
    method: "POST",
    url: `${googleBusinessInformationBaseUrl}/googleLocations:search`,
  })
}

export function buildGoogleLocationValidationRequest(
  input: CreateLocationInput
): HttpRequestSpec {
  const url = new URL(
    `${googleBusinessInformationBaseUrl}/${input.accountName}/locations`
  )
  url.searchParams.set("requestId", input.requestId)
  url.searchParams.set("validateOnly", "true")

  return buildGoogleRequestSpec({
    accessToken: input.accessToken,
    body: input.location,
    method: "POST",
    url: url.toString(),
  })
}

export function buildGoogleLocationCreateRequest(
  input: CreateLocationInput
): HttpRequestSpec {
  const url = new URL(
    `${googleBusinessInformationBaseUrl}/${input.accountName}/locations`
  )
  url.searchParams.set("requestId", input.requestId)
  url.searchParams.set("validateOnly", "false")

  return buildGoogleRequestSpec({
    accessToken: input.accessToken,
    body: input.location,
    method: "POST",
    url: url.toString(),
  })
}

export function buildGoogleRequestAdminRightsRequest(
  input: RequestAdminRightsInput
): HttpRequestSpec {
  return buildGoogleRequestSpec({
    accessToken: input.accessToken,
    body: { googleLocationId: input.googleLocationId },
    method: "POST",
    url: input.requestAdminRightsUrl,
  })
}

export function createProductionBusinessInformation(
  env: AdapterEnvironment
): GbpBusinessInformationAdapter {
  return {
    async searchLocations(input) {
      const blocked = googleBlockedResult(env)
      if (blocked.kind === "blocked_by_credentials") {
        return blocked
      }

      return {
        kind: "ok",
        value: buildGoogleLocationSearchRequest(input),
      }
    },
    async requestAdminRights(input) {
      const blocked = googleBlockedResult(env)
      if (blocked.kind === "blocked_by_credentials") {
        return blocked
      }

      return {
        kind: "ok",
        value: buildGoogleRequestAdminRightsRequest(input),
      }
    },
    async validateLocation(input) {
      const blocked = googleBlockedResult(env)
      if (blocked.kind === "blocked_by_credentials") {
        return blocked
      }

      return {
        kind: "ok",
        value: buildGoogleLocationValidationRequest(input),
      }
    },
    async createLocation(input) {
      const blocked = googleBlockedResult(env)
      if (blocked.kind === "blocked_by_credentials") {
        return blocked
      }

      return {
        kind: "ok",
        value: buildGoogleLocationCreateRequest(input),
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
