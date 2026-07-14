import { createHash } from "node:crypto"

import type { IntegrationAdapters } from "@/integrations/contracts"
import type { SqliteDatabase } from "@/server/db/sqlite"
import type { GbpStore } from "@/server/repositories/gbp-store"
import type { StoreProfileRepository } from "@/server/repositories/store-profile"

import {
  consumeRegistrationIntent,
  createRegistrationIntent,
  persistSetupRecords,
  readSetupConnection,
} from "./setup-records"
import {
  buildGoogleLocationBody,
  buildGoogleLocationSearchBody,
  getConfirmedGbpStoreProfile,
  stableGbpSetupRequestId,
} from "./store-profile"

export type GbpSetupMode = "stub" | "production"

export type GbpSetupConnection = {
  readonly accessToken: string
  readonly expiresAt?: string
  readonly refreshToken?: string
  readonly scopes?: readonly string[]
  readonly subjectId?: string
}

export type GbpSetupResult =
  | {
      readonly status: "REGISTRATION_REVIEW_REQUIRED"
      readonly accountName: string
      readonly accountDisplayName: string
      readonly address: string
      readonly businessName: string
      readonly categoryDisplayName: string
      readonly categoryName: string
      readonly languageCode: string
      readonly message: string
      readonly phone: string
      readonly reviewToken: string
      readonly storeCode: string
    }
  | {
      readonly status: "EXISTING_LOCATION_FOUND"
      readonly googleLocationId: string
      readonly requestAdminRightsUrl?: string
      readonly message: string
    }
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
  | {
      readonly status: "GOOGLE_OAUTH_REQUIRED"
      readonly message: string
    }
  | {
      readonly status: "GOOGLE_API_ERROR"
      readonly message: string
    }

export type SetupGoogleBusinessProfileOptions = {
  readonly adapters: IntegrationAdapters
  readonly connection?: GbpSetupConnection
  readonly database?: SqliteDatabase
  readonly gbpStore?: GbpStore
  readonly mode: GbpSetupMode
  readonly reviewToken?: string
  readonly storeProfileRepository?: StoreProfileRepository
  readonly storeId: string
}

class GbpSetupConfigurationError extends Error {
  readonly name = "GbpSetupConfigurationError"
}

function registrationPayloadDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

export type BuildClaimRequiredResultOptions = {
  readonly accountDisplayName?: string
  readonly accountName?: string
  readonly googleLocationId: string
  readonly requestAdminRightsUrl: string
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

  const searchLocationBody = buildGoogleLocationSearchBody(
    storeProfileResult.profile
  )
  const oauthResult = options.adapters.googleOAuth.connect()
  if (oauthResult.kind === "blocked_by_credentials") {
    return {
      status: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: oauthResult.missingEnvVars,
      message: "Google OAuth 인증 정보가 설정되지 않았습니다.",
    }
  }

  const connection: GbpSetupConnection | undefined =
    options.mode === "stub"
      ? { accessToken: "stub-access-token" }
      : (options.connection ?? (await readSetupConnection(options)))
  if (connection === undefined) {
    return {
      status: "GOOGLE_OAUTH_REQUIRED",
      message: "Google 계정을 연결하면 실제 매장 등록을 시작해요.",
    }
  }
  if (
    options.mode === "production" &&
    connection.expiresAt !== undefined &&
    Date.parse(connection.expiresAt) <= options.adapters.clock.now().getTime()
  ) {
    return {
      status: "GOOGLE_OAUTH_REQUIRED",
      message: "Google 연결이 만료되었습니다. 계정을 다시 연결해주세요.",
    }
  }

  const accountsResult =
    await options.adapters.gbpBusinessInformation.listAccounts({
      accessToken: connection.accessToken,
    })
  if (accountsResult.kind === "blocked_by_credentials") {
    return {
      status: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: accountsResult.missingEnvVars,
      message: "Google Business Profile 인증 정보가 설정되지 않았습니다.",
    }
  }
  if (accountsResult.value.accounts.length > 1) {
    return {
      status: "GOOGLE_API_ERROR",
      message:
        "여러 Google Business Profile 계정이 있어 자동으로 선택할 수 없습니다.",
    }
  }
  const account = accountsResult.value.accounts[0]
  if (account === undefined) {
    return {
      status: "GOOGLE_API_ERROR",
      message: "Google Business Profile 계정을 찾지 못했습니다.",
    }
  }

  const searchResult =
    await options.adapters.gbpBusinessInformation.searchLocations({
      accessToken: connection.accessToken,
      location: searchLocationBody,
    })
  if (searchResult.kind === "blocked_by_credentials") {
    return {
      status: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: searchResult.missingEnvVars,
      message: "Google Business Profile 인증 정보가 설정되지 않았습니다.",
    }
  }

  const existingMatch = searchResult.value.matches[0]
  if (existingMatch !== undefined) {
    return {
      status: "EXISTING_LOCATION_FOUND",
      googleLocationId: existingMatch.googleLocationId,
      ...(existingMatch.requestAdminRightsUrl === undefined
        ? {}
        : { requestAdminRightsUrl: existingMatch.requestAdminRightsUrl }),
      message:
        "기존 Google 비즈니스 프로필 후보를 찾았습니다. 중복 생성을 막기 위해 Google에서 소유권을 먼저 확인해주세요.",
    }
  }

  const categoryResult =
    await options.adapters.gbpBusinessInformation.findCategory({
      accessToken: connection.accessToken,
      displayName: storeProfileResult.profile.category,
    })
  if (categoryResult.kind === "blocked_by_credentials") {
    return {
      status: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: categoryResult.missingEnvVars,
      message: "Google Business Profile 인증 정보가 설정되지 않았습니다.",
    }
  }
  const category = categoryResult.value.category
  if (category === undefined) {
    return {
      status: "GOOGLE_API_ERROR",
      message: "Google Business Profile 업종을 찾지 못했습니다.",
    }
  }
  if (category.displayName !== storeProfileResult.profile.category) {
    return {
      status: "GOOGLE_API_ERROR",
      message: "Google 업종을 정확히 일치시킬 수 없습니다.",
    }
  }
  const locationBody = buildGoogleLocationBody(
    storeProfileResult.profile,
    category.name
  )
  const requestId = stableGbpSetupRequestId(
    storeProfileResult.profile,
    category.name
  )
  const googleSubjectId =
    connection.subjectId ??
    options.connection?.subjectId ??
    oauthResult.value.subjectId
  const payloadDigest = registrationPayloadDigest({
    accountName: account.name,
    googleSubjectId,
    location: locationBody,
    requestId,
  })

  const validationResult =
    await options.adapters.gbpBusinessInformation.validateLocation({
      accessToken: connection.accessToken,
      accountName: account.name,
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

  if (options.reviewToken === undefined) {
    const reviewToken = await createRegistrationIntent(options, {
      googleSubjectId,
      payloadDigest,
    })
    return {
      status: "REGISTRATION_REVIEW_REQUIRED",
      accountName: account.name,
      accountDisplayName: account.accountName,
      address: storeProfileResult.profile.address,
      businessName: storeProfileResult.profile.name,
      categoryDisplayName: category.displayName,
      categoryName: category.name,
      languageCode: "ko",
      message:
        "고객이 이 주소로 방문하는 매장형 비즈니스인지 확인하고 등록을 승인해주세요.",
      phone: storeProfileResult.profile.phone,
      reviewToken,
      storeCode: storeProfileResult.profile.storeId,
    }
  }

  const reviewAccepted = await consumeRegistrationIntent(options, {
    googleSubjectId,
    id: options.reviewToken,
    payloadDigest,
  })
  if (!reviewAccepted) {
    return {
      status: "GOOGLE_API_ERROR",
      message:
        "등록 검토가 만료되었거나 이미 사용되었습니다. 다시 확인해주세요.",
    }
  }

  const locationResult =
    await options.adapters.gbpBusinessInformation.createLocation({
      accessToken: connection.accessToken,
      accountName: account.name,
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
    {
      accountDisplayName: account.accountName,
      accountName: account.name,
      googleLocationId: locationResult.value.googleLocationId,
      status: "VERIFICATION_PENDING",
    },
    googleSubjectId
  )
}
