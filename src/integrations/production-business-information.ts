import { z } from "zod"

import { blockedByCredentials, missingEnvVars } from "./credentials"
import type {
  AdapterEnvironment,
  BlockedByCredentials,
  ExternalFetch,
  GbpBusinessInformationAdapter,
  HttpRequestSpec,
} from "./contracts"
import {
  buildGoogleLocationCreateRequest,
  buildGoogleLocationSearchRequest,
  buildGoogleLocationValidationRequest,
  buildGoogleRequestSpec,
  businessInformationBaseUrl,
} from "./production-business-information-requests"

export {
  buildGoogleLocationCreateRequest,
  buildGoogleLocationSearchRequest,
  buildGoogleLocationValidationRequest,
  buildGoogleRequestAdminRightsRequest,
} from "./production-business-information-requests"

const googleEnvVars = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const
const accountManagementUrl =
  "https://mybusinessaccountmanagement.googleapis.com/v1/accounts"

const accountsResponseSchema = z.object({
  accounts: z
    .array(
      z.object({
        accountName: z.string().min(1).optional(),
        name: z.string().min(1),
      })
    )
    .default([]),
})

const searchResponseSchema = z.object({
  googleLocations: z
    .array(
      z.object({
        name: z.string().min(1),
        location: z.record(z.string(), z.unknown()).optional(),
        requestAdminRightsUrl: z.url().optional(),
      })
    )
    .default([]),
})

const createdLocationSchema = z.object({ name: z.string().min(1) })
const categoriesResponseSchema = z.object({
  categories: z
    .array(
      z.object({
        displayName: z.string().min(1),
        name: z.string().min(1),
      })
    )
    .default([]),
})

export class GoogleBusinessProfileApiError extends Error {
  readonly name = "GoogleBusinessProfileApiError"

  constructor(
    readonly action: string,
    readonly status: number
  ) {
    super(`Google Business Profile ${action} failed with ${status}.`)
  }
}

async function executeJson(
  fetchImpl: ExternalFetch,
  spec: HttpRequestSpec,
  action: string
): Promise<unknown> {
  const response = await fetchImpl(spec.url, {
    headers: spec.headers,
    method: spec.method,
    signal: AbortSignal.timeout(15_000),
    ...(spec.body === undefined ? {} : { body: JSON.stringify(spec.body) }),
  })
  if (!response.ok) {
    throw new GoogleBusinessProfileApiError(action, response.status)
  }
  return await response.json()
}

function blocked(env: AdapterEnvironment): BlockedByCredentials | undefined {
  const missing = missingEnvVars(env, googleEnvVars)
  return missing.length === 0 ? undefined : blockedByCredentials(missing)
}

export function createProductionBusinessInformation(
  env: AdapterEnvironment,
  fetchImpl: ExternalFetch = globalThis.fetch
): GbpBusinessInformationAdapter {
  return {
    async findCategory(input) {
      const unavailable = blocked(env)
      if (unavailable !== undefined) return unavailable
      const url = new URL(`${businessInformationBaseUrl}/categories`)
      url.searchParams.set("regionCode", "KR")
      url.searchParams.set("languageCode", "ko")
      url.searchParams.set("view", "BASIC")
      url.searchParams.set("filter", `displayName=${input.displayName}`)
      const payload = categoriesResponseSchema.parse(
        await executeJson(
          fetchImpl,
          buildGoogleRequestSpec({
            accessToken: input.accessToken,
            method: "GET",
            url: url.toString(),
          }),
          "category lookup"
        )
      )
      const exactCategories = payload.categories.filter(
        (category) => category.displayName === input.displayName
      )
      return {
        kind: "ok",
        value: {
          category:
            exactCategories.length === 1 ? exactCategories[0] : undefined,
        },
      }
    },
    async listAccounts(input) {
      const unavailable = blocked(env)
      if (unavailable !== undefined) return unavailable
      const payload = accountsResponseSchema.parse(
        await executeJson(
          fetchImpl,
          buildGoogleRequestSpec({
            accessToken: input.accessToken,
            method: "GET",
            url: accountManagementUrl,
          }),
          "account discovery"
        )
      )
      return {
        kind: "ok",
        value: {
          accounts: payload.accounts.map((account) => ({
            accountName: account.accountName ?? account.name,
            name: account.name,
          })),
        },
      }
    },
    async searchLocations(input) {
      const unavailable = blocked(env)
      if (unavailable !== undefined) return unavailable
      const payload = searchResponseSchema.parse(
        await executeJson(
          fetchImpl,
          buildGoogleLocationSearchRequest(input),
          "duplicate search"
        )
      )
      return {
        kind: "ok",
        value: {
          matches: payload.googleLocations.map((location) => ({
            googleLocationId: location.name,
            ...(location.requestAdminRightsUrl === undefined
              ? {}
              : { requestAdminRightsUrl: location.requestAdminRightsUrl }),
          })),
        },
      }
    },
    async requestAdminRights() {
      return { kind: "ok", value: undefined }
    },
    async validateLocation(input) {
      const unavailable = blocked(env)
      if (unavailable !== undefined) return unavailable
      await executeJson(
        fetchImpl,
        buildGoogleLocationValidationRequest(input),
        "location validation"
      )
      return { kind: "ok", value: undefined }
    },
    async createLocation(input) {
      const unavailable = blocked(env)
      if (unavailable !== undefined) return unavailable
      const payload = createdLocationSchema.parse(
        await executeJson(
          fetchImpl,
          buildGoogleLocationCreateRequest(input),
          "location creation"
        )
      )
      return {
        kind: "ok",
        value: { googleLocationId: payload.name },
      }
    },
  }
}
