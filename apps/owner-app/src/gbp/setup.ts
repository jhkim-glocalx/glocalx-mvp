import { z } from "zod"

import { locationStatusSchema } from "@glocalx/domain/location-status"
import type { LocationStatus } from "@glocalx/domain/location-status"
import type {
  HttpRequestSpec,
  IntegrationAdapters,
  SearchGoogleLocationsResult,
} from "@/integrations/contracts"
import type { SqliteDatabase } from "@glocalx/db/sqlite"
import type { GbpStore } from "@/server/repositories/gbp-store"
import type { StoreProfileRepository } from "@/server/repositories/store-profile"

import {
  persistClaimRequiredRecords,
  persistSetupRecords,
} from "./setup-records"
import {
  buildGoogleLocationBody,
  getConfirmedGbpStoreProfile,
  stableGbpSetupRequestId,
} from "./store-profile"

const locationSpecBodySchema = z
  .object({
    status: locationStatusSchema,
  })
  .passthrough()

export type GbpSetupMode = "stub" | "production"

export type GbpSetupResult =
  | {
      readonly status: "VERIFICATION_PENDING" | "VERIFIED" | "CREATE_REQUESTED"
      readonly googleLocationId: string
      readonly oauthConnectionId: string
      readonly gbpLocationId: string
      readonly followUpJobId?: string
      readonly auditLogId: string
      readonly message: string
    }
  | {
      readonly status: "CLAIM_REQUIRED"
      readonly googleLocationId: string
      readonly requestAdminRightsUrl: string
      readonly followUpRequired: boolean
      readonly message: string
    }
  | {
      readonly status: "BLOCKED_BY_CREDENTIALS"
      readonly missingEnvVars: readonly string[]
      readonly message: string
    }
  | {
      readonly status: "STORE_PROFILE_REQUIRED"
      readonly message: string
    }

export type SetupGoogleBusinessProfileOptions = {
  readonly adapters: IntegrationAdapters
  readonly database?: SqliteDatabase
  readonly gbpStore?: GbpStore
  readonly mode: GbpSetupMode
  readonly storeProfileRepository?: StoreProfileRepository
  readonly storeId: string
}

class GbpSetupConfigurationError extends Error {
  readonly name = "GbpSetupConfigurationError"
}

export type BuildClaimRequiredResultOptions = {
  readonly googleLocationId: string
  readonly requestAdminRightsUrl: string
}

function locationStatusFromSpecBody(body: unknown): LocationStatus {
  // Missing or malformed Google status stays pending until verification proves a stronger state.
  const parsed = locationSpecBodySchema.safeParse(body)
  if (!parsed.success) {
    return "VERIFICATION_PENDING"
  }
  return parsed.data.status
}

function isSearchGoogleLocationsResult(
  value: SearchGoogleLocationsResult | HttpRequestSpec
): value is SearchGoogleLocationsResult {
  // Production mode can return a request spec, so only concrete search results are narrowed for claimed matches.
  return "matches" in value
}

export function buildClaimRequiredResult(
  options: BuildClaimRequiredResultOptions
): GbpSetupResult {
  return {
    status: "CLAIM_REQUIRED",
    googleLocationId: options.googleLocationId,
    requestAdminRightsUrl: options.requestAdminRightsUrl,
    followUpRequired: true,
    message:
      "이미 소유자가 있는 Google 비즈니스 프로필입니다. 관리자 권한 요청을 진행해주세요.",
  }
}

async function readConfirmedGbpStoreProfile(
  options: SetupGoogleBusinessProfileOptions
) {
  if (options.storeProfileRepository !== undefined) {
    return await options.storeProfileRepository.readConfirmedGbpProfile(
      options.storeId
    )
  }
  if (options.database !== undefined) {
    return getConfirmedGbpStoreProfile(options.database, options.storeId)
  }
  throw new GbpSetupConfigurationError()
}

export async function setupGoogleBusinessProfile(
  options: SetupGoogleBusinessProfileOptions
): Promise<GbpSetupResult> {
  const storeProfileResult = await readConfirmedGbpStoreProfile(options)
  if (storeProfileResult.kind === "missing") {
    // A GBP listing cannot be created until onboarding has confirmed the public store facts.
    return {
      status: "STORE_PROFILE_REQUIRED",
      message: "GBP 세팅 전에 매장 정보를 먼저 확인해주세요.",
    }
  }

  const locationBody = buildGoogleLocationBody(storeProfileResult.profile)
  const requestId = stableGbpSetupRequestId(storeProfileResult.profile)
  const oauthResult = options.adapters.googleOAuth.connect()
  if (oauthResult.kind === "blocked_by_credentials") {
    return {
      status: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: oauthResult.missingEnvVars,
      message: "Google OAuth 인증 정보가 설정되지 않았습니다.",
    }
  }

  const searchResult =
    await options.adapters.gbpBusinessInformation.searchLocations({
      accessToken: "stub-access-token",
      location: locationBody,
    })
  if (searchResult.kind === "blocked_by_credentials") {
    return {
      status: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: searchResult.missingEnvVars,
      message: "Google Business Profile 인증 정보가 설정되지 않았습니다.",
    }
  }

  if (isSearchGoogleLocationsResult(searchResult.value)) {
    const claimedMatch = searchResult.value.matches.find(
      (match) => match.requestAdminRightsUrl !== undefined
    )
    if (claimedMatch?.requestAdminRightsUrl !== undefined) {
      await options.adapters.gbpBusinessInformation.requestAdminRights({
        accessToken: "stub-access-token",
        googleLocationId: claimedMatch.googleLocationId,
        requestAdminRightsUrl: claimedMatch.requestAdminRightsUrl,
      })
      // Persist before returning so owners keep the admin-rights follow-up after leaving setup.
      await persistClaimRequiredRecords(options, {
        googleLocationId: claimedMatch.googleLocationId,
        requestAdminRightsUrl: claimedMatch.requestAdminRightsUrl,
      })
      return buildClaimRequiredResult({
        googleLocationId: claimedMatch.googleLocationId,
        requestAdminRightsUrl: claimedMatch.requestAdminRightsUrl,
      })
    }
  }

  const validationResult =
    await options.adapters.gbpBusinessInformation.validateLocation({
      accessToken: "stub-access-token",
      accountName: "accounts/stub",
      requestId,
      location: locationBody,
    })
  if (validationResult.kind === "blocked_by_credentials") {
    return {
      status: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: validationResult.missingEnvVars,
      message: "Google Business Profile 인증 정보가 설정되지 않았습니다.",
    }
  }

  const locationResult =
    await options.adapters.gbpBusinessInformation.createLocation({
      accessToken: "stub-access-token",
      accountName: "accounts/stub",
      requestId,
      location: locationBody,
    })
  if (locationResult.kind === "blocked_by_credentials") {
    return {
      status: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: locationResult.missingEnvVars,
      message: "Google Business Profile 인증 정보가 설정되지 않았습니다.",
    }
  }

  return persistSetupRecords(
    options,
    locationStatusFromSpecBody(locationResult.value.body),
    oauthResult.value.subjectId
  )
}
