import { z } from "zod"

import { locationStatusSchema } from "@glocalx/domain/location-status"
import type { LocationStatus } from "@glocalx/domain/location-status"
import type {
  AdapterEnvironment,
  ExternalFetch,
  HttpRequestSpec,
  IntegrationAdapters,
  SearchGoogleLocationsResult,
} from "@glocalx/integrations/contracts"
import type { SqliteDatabase } from "@glocalx/db/sqlite"
import type { GbpStore } from "@/server/repositories/gbp-store"
import type { ExistingGbpLocation } from "@/server/repositories/gbp-setup-store"
import type { StoreProfileRepository } from "@/server/repositories/store-profile"

import {
  persistClaimRequiredRecords,
  persistGbpVerificationState,
  persistLiveClaimRequiredRecords,
  persistLiveSetupRecords,
  persistSetupRecords,
} from "./setup-records"
import { runGbpVerificationAttempt } from "./verification"
import type { GbpVerificationStore } from "@glocalx/db/support/gbp-verification-store"
import type { GbpAccessStore } from "@glocalx/db/support/gbp-access-store"
import {
  buildLiveGoogleLocationBody,
  resolveLiveGbpCredentials,
  runLiveGbpProvisioning,
} from "./setup-live"
import {
  buildGoogleLocationBody,
  getConfirmedGbpStoreProfile,
  stableGbpSetupRequestId,
} from "./store-profile"
import type { ConfirmedGbpStoreProfile } from "./store-profile"

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
  | {
      // Live path only: the owner has not yet chosen a GBP primary category, so
      // there is no `categories/gcid:*` to send Google.
      readonly status: "CATEGORY_REQUIRED"
      readonly message: string
    }
  | {
      // Live path only: geocoding could not turn the confirmed address into the
      // administrativeArea/locality/postalCode + latlng Google's create requires.
      readonly status: "ADDRESS_NOT_GEOCODABLE"
      readonly message: string
    }
  | {
      // Credentials were present but a live Google call failed (bad token,
      // quota, upstream outage) — recoverable by retrying, distinct from a
      // missing-credential block.
      readonly status: "SETUP_UPSTREAM_ERROR"
      readonly message: string
    }
  | {
      // The store is already attached to a Google listing, or an operator is
      // still ruling on the owner's claim that it should be. Terminal for this
      // call by design: creating here is what produces a duplicate listing, and
      // a duplicate costs a merge request and a lost verification to undo.
      readonly status: "ALREADY_LINKED"
      readonly googleLocationId?: string
      readonly message: string
    }

export type SetupGoogleBusinessProfileOptions = {
  readonly actorUserId: string
  readonly adapters: IntegrationAdapters
  readonly database?: SqliteDatabase
  // Live setup reads the org GBP credentials from here (the route passes
  // process.env); fetchImpl defaults to global fetch and is injectable in tests.
  readonly env?: AdapterEnvironment
  readonly fetchImpl?: ExternalFetch
  readonly gbpStore?: GbpStore
  // Read by the duplicate guard: an in-flight adoption claim must hold off
  // provisioning until an operator rules on it. Optional so existing callers and
  // tests that predate the guard keep working — absent means "nothing claimed".
  readonly gbpAccessStore?: Pick<GbpAccessStore, "getGbpAccessRequestForStore">
  // Injectable for tests; the live path falls back to a database-backed store.
  readonly gbpVerificationStore?: GbpVerificationStore
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

const guardLocationRowSchema = z.object({
  googleLocationId: z.string().min(1),
  status: z.string(),
  requestAdminRightsUrl: z.string().nullable(),
})

function readExistingGbpLocationFromDatabase(
  options: SetupGoogleBusinessProfileOptions
): ExistingGbpLocation | undefined {
  if (options.database === undefined) {
    return undefined
  }
  const row = options.database
    .prepare(
      "SELECT google_location_id AS googleLocationId, status, request_admin_rights_url AS requestAdminRightsUrl FROM gbp_locations WHERE store_id = ? AND google_location_id IS NOT NULL LIMIT 1"
    )
    .get(options.storeId)
  const parsed = guardLocationRowSchema.safeParse(row)
  return parsed.success ? parsed.data : undefined
}

// Runs before anything reaches Google. Both branches mean "this store's listing
// question is already settled or being settled elsewhere", and in both cases the
// only harmful thing setup could do is create a second listing.
async function readDuplicateGuardBlock(
  options: SetupGoogleBusinessProfileOptions
): Promise<GbpSetupResult | undefined> {
  // Reads through whichever handle the caller supplied, the same dual path
  // readConfirmedGbpStoreProfile uses. A guard that silently no-ops when only a
  // database is passed would be worse than no guard — it would read as covered.
  const existing =
    options.gbpStore !== undefined
      ? await options.gbpStore.readExistingGbpLocation(options.storeId)
      : readExistingGbpLocationFromDatabase(options)

  if (existing !== undefined) {
    // A claim still waiting on the current owner is unfinished business, not a
    // completed link: re-return it so a retry hands the owner back the
    // admin-rights URL they still need instead of a dead end.
    if (
      existing.status === "CLAIM_REQUIRED" &&
      existing.requestAdminRightsUrl !== null
    ) {
      return buildClaimRequiredResult({
        googleLocationId: existing.googleLocationId,
        requestAdminRightsUrl: existing.requestAdminRightsUrl,
      })
    }
    return {
      status: "ALREADY_LINKED",
      googleLocationId: existing.googleLocationId,
      message: "이미 연결된 Google 비즈니스 프로필이 있습니다.",
    }
  }

  const accessRequest =
    await options.gbpAccessStore?.getGbpAccessRequestForStore(options.storeId)
  if (accessRequest?.state === "adoption_review") {
    return {
      status: "ALREADY_LINKED",
      message:
        "이미 등록된 프로필인지 확인하고 있습니다. 확인이 끝나면 알려드릴게요.",
    }
  }

  return undefined
}

export async function setupGoogleBusinessProfile(
  options: SetupGoogleBusinessProfileOptions
): Promise<GbpSetupResult> {
  const duplicateBlock = await readDuplicateGuardBlock(options)
  if (duplicateBlock !== undefined) {
    return duplicateBlock
  }

  const storeProfileResult = await readConfirmedGbpStoreProfile(options)
  if (storeProfileResult.kind === "missing") {
    // A GBP listing cannot be created until onboarding has confirmed the public store facts.
    return {
      status: "STORE_PROFILE_REQUIRED",
      message: "GBP 세팅 전에 매장 정보를 먼저 확인해주세요.",
    }
  }

  const requestId = stableGbpSetupRequestId(storeProfileResult.profile)

  // Production adapters return executable request specs rather than canned
  // results, so the live path resolves the org token, geocodes the address, and
  // runs the specs against Google instead of the stub flow below. The stub body
  // (built here) stays a simple display-name shape; only the live path needs the
  // geocoded parts and owner-picked gcid.
  if (options.adapters.mode === "production") {
    return setupGoogleBusinessProfileLive(
      options,
      storeProfileResult.profile,
      requestId
    )
  }

  const locationBody = buildGoogleLocationBody(storeProfileResult.profile)
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

  const stubResult = await persistSetupRecords(
    options,
    locationStatusFromSpecBody(locationResult.value.body),
    oauthResult.value.subjectId
  )

  // Stub/demo determinism: the live path derives verification state from Google,
  // but stub setup never calls Google, so seed a fixed NEEDS_CONCIERGE row. That
  // mirrors the live-observed reality (a brand-new KR listing lands in the
  // operator concierge path) and gives the owner card and the admin concierge
  // surface something to render in local demos and e2e. Best-effort — a missing
  // store just records nothing, exactly like the live attempt.
  if ("googleLocationId" in stubResult) {
    await persistGbpVerificationState(options, stubResult.googleLocationId, {
      state: "NEEDS_CONCIERGE",
      offeredMethods: [],
      autoAttempted: false,
    })
  }

  return stubResult
}

async function setupGoogleBusinessProfileLive(
  options: SetupGoogleBusinessProfileOptions,
  profile: ConfirmedGbpStoreProfile,
  requestId: string
): Promise<GbpSetupResult> {
  const built = await buildLiveGoogleLocationBody({
    profile,
    geocoding: options.adapters.geocoding,
  })
  switch (built.kind) {
    case "category_required":
      return {
        status: "CATEGORY_REQUIRED",
        message: "GBP 대표 카테고리를 먼저 선택해주세요.",
      }
    case "address_unresolved":
      return { status: "ADDRESS_NOT_GEOCODABLE", message: built.message }
    case "geocode_upstream_error":
      return {
        status: "SETUP_UPSTREAM_ERROR",
        message:
          "주소 좌표 변환에 일시적으로 실패했습니다. 잠시 후 다시 시도해주세요.",
      }
    case "geocode_blocked_by_credentials":
      return {
        status: "BLOCKED_BY_CREDENTIALS",
        missingEnvVars: built.missingEnvVars,
        message: "주소 지오코딩 인증 정보가 설정되지 않았습니다.",
      }
    case "ok":
      break
  }
  const location = built.location

  const env = options.env ?? {}
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const credentials = await resolveLiveGbpCredentials({ env, fetchImpl })
  if (credentials.kind === "blocked_by_credentials") {
    return {
      status: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: credentials.missingEnvVars,
      message:
        "Google Business Profile 조직 계정 인증 정보가 설정되지 않았습니다.",
    }
  }
  if (credentials.kind === "auth_failed") {
    return {
      status: "SETUP_UPSTREAM_ERROR",
      message:
        "Google 조직 계정 토큰이 만료되었거나 취소되었습니다. 토큰을 다시 발급해주세요.",
    }
  }

  const provisioning = await runLiveGbpProvisioning({
    adapters: {
      gbpBusinessInformation: options.adapters.gbpBusinessInformation,
    },
    credentials: credentials.credentials,
    fetchImpl,
    location,
    requestId,
  })
  if (provisioning.kind === "upstream_error") {
    return { status: "SETUP_UPSTREAM_ERROR", message: provisioning.message }
  }
  if (provisioning.kind === "claim_required") {
    await persistLiveClaimRequiredRecords(
      options,
      {
        googleLocationId: provisioning.googleLocationId,
        requestAdminRightsUrl: provisioning.requestAdminRightsUrl,
      },
      credentials.credentials.accountName
    )
    return buildClaimRequiredResult({
      googleLocationId: provisioning.googleLocationId,
      requestAdminRightsUrl: provisioning.requestAdminRightsUrl,
    })
  }

  const setupResult = await persistLiveSetupRecords(
    options,
    provisioning.status,
    credentials.credentials.accountName,
    provisioning.googleLocationId
  )

  // Best-effort verification attempt on the freshly created listing: read
  // Google's verification signals, opportunistically try AUTO, and persist the
  // resulting state for the owner card + operator concierge queue. Wrapped so any
  // failure never undoes a successful create — the listing already exists, and
  // the state is re-checked on-view anyway.
  try {
    const attempt = await runGbpVerificationAttempt({
      verifications: options.adapters.gbpVerifications,
      accessToken: credentials.credentials.accessToken,
      locationName: provisioning.googleLocationId,
      fetchImpl,
    })
    await persistGbpVerificationState(
      options,
      provisioning.googleLocationId,
      attempt
    )
  } catch (error) {
    // Log the failure shape only — never tokens or the signed request specs.
    console.error(
      `GBP verification attempt failed for store "${options.storeId}"`,
      error instanceof Error ? error.message : error
    )
  }

  return setupResult
}
