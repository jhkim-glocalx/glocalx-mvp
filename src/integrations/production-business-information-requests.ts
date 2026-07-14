import { googleBusinessManageScope } from "./credentials"
import type {
  CreateLocationInput,
  HttpMethod,
  HttpRequestSpec,
  RequestAdminRightsInput,
  SearchGoogleLocationsInput,
} from "./contracts"

const businessInformationBaseUrl =
  "https://mybusinessbusinessinformation.googleapis.com/v1"
const googleLocationSearchUrl =
  "https://mybusiness.googleapis.com/v4/googleLocations:search"

export function buildGoogleRequestSpec(options: {
  readonly accessToken: string
  readonly body?: unknown
  readonly method: HttpMethod
  readonly url: string
}): HttpRequestSpec {
  return {
    method: options.method,
    url: options.url,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${options.accessToken}`,
      "Content-Type": "application/json",
    },
    requiredScopes: [googleBusinessManageScope],
    ...(options.body === undefined ? {} : { body: options.body }),
  }
}

export function buildGoogleLocationSearchRequest(
  input: SearchGoogleLocationsInput
): HttpRequestSpec {
  return buildGoogleRequestSpec({
    accessToken: input.accessToken,
    body: { location: input.location, resultCount: 10 },
    method: "POST",
    url: googleLocationSearchUrl,
  })
}

export function buildGoogleLocationValidationRequest(
  input: CreateLocationInput
): HttpRequestSpec {
  const url = new URL(
    `${businessInformationBaseUrl}/${input.accountName}/locations`
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
    `${businessInformationBaseUrl}/${input.accountName}/locations`
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
    method: "GET",
    url: input.requestAdminRightsUrl,
  })
}

export { businessInformationBaseUrl }
