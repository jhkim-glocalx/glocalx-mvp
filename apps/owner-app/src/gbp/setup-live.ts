import { z } from "zod"

import type { LocationStatus } from "@glocalx/domain/location-status"
import type {
  AdapterEnvironment,
  ExternalFetch,
  GbpBusinessInformationAdapter,
  GeocodedAddress,
  GeocodingAdapter,
  HttpRequestSpec,
  SearchGoogleLocationsResult,
} from "@glocalx/integrations/contracts"
import {
  GoogleOrgTokenError,
  createGoogleOrgTokenProvider,
  resolveGoogleOrgAccountName,
} from "@glocalx/integrations/google-org-auth"

import type { ConfirmedGbpStoreProfile } from "./store-profile"

// The live (org-account) GBP provisioning path. Unlike the stub path — which
// reads canned results straight off the adapter — production adapters return
// executable request specs, so this module supplies the org access token,
// executes the specs against Google, and normalizes the responses into the
// small result shape setup.ts maps onto a GbpSetupResult and persists.

export type LiveGbpCredentials = {
  readonly accessToken: string
  readonly accountName: string
}

export type ResolveLiveGbpCredentialsResult =
  | { readonly kind: "ok"; readonly credentials: LiveGbpCredentials }
  | {
      readonly kind: "blocked_by_credentials"
      readonly missingEnvVars: readonly string[]
    }
  | { readonly kind: "auth_failed" }

export type LiveGbpProvisioningResult =
  | {
      readonly kind: "claim_required"
      readonly googleLocationId: string
      readonly requestAdminRightsUrl: string
    }
  | {
      readonly kind: "provisioned"
      readonly status: LocationStatus
      readonly googleLocationId: string
    }
  | { readonly kind: "upstream_error"; readonly message: string }

// Turning a confirmed store profile into a live locations.create body needs two
// things the stub body never had: an owner-picked `categories/gcid:*` (Google
// rejects a free-text category) and geocoded address parts + a pin (Google's
// create wants administrativeArea/locality/postalCode + latlng, not one address
// line). Each gap is a distinct owner- or operator-actionable block, so they
// surface as separate result kinds rather than a single failure.
export type BuildLiveLocationResult =
  | {
      readonly kind: "ok"
      readonly location: Readonly<Record<string, unknown>>
    }
  | { readonly kind: "category_required" }
  | { readonly kind: "address_unresolved"; readonly message: string }
  | { readonly kind: "geocode_upstream_error" }
  | {
      readonly kind: "geocode_blocked_by_credentials"
      readonly missingEnvVars: readonly string[]
    }

export async function buildLiveGoogleLocationBody(options: {
  readonly profile: ConfirmedGbpStoreProfile
  readonly geocoding: GeocodingAdapter
}): Promise<BuildLiveLocationResult> {
  const categoryId = options.profile.primaryCategoryId
  if (categoryId === undefined) {
    return { kind: "category_required" }
  }

  const geocodeResult = await options.geocoding.geocodeAddress({
    address: options.profile.address,
  })
  if (geocodeResult.kind === "blocked_by_credentials") {
    return {
      kind: "geocode_blocked_by_credentials",
      missingEnvVars: geocodeResult.missingEnvVars,
    }
  }

  const outcome = geocodeResult.value
  switch (outcome.kind) {
    case "resolved":
      return {
        kind: "ok",
        location: assembleLiveLocation(
          options.profile,
          categoryId,
          outcome.address
        ),
      }
    case "not_found":
      return {
        kind: "address_unresolved",
        message: "주소를 지도에서 찾지 못했습니다. 주소를 다시 확인해주세요.",
      }
    case "incomplete":
      return {
        kind: "address_unresolved",
        message:
          "주소에서 우편번호를 확인하지 못했습니다. 도로명 주소를 다시 확인해주세요.",
      }
    case "upstream_error":
      return { kind: "geocode_upstream_error" }
  }
}

function assembleLiveLocation(
  profile: ConfirmedGbpStoreProfile,
  categoryId: string,
  address: GeocodedAddress
): Readonly<Record<string, unknown>> {
  // languageCode ties the whole listing to Korean (immutable at create), and
  // storeCode ties Google's record back to this local store for retries.
  return {
    languageCode: "ko",
    title: profile.name,
    storeCode: profile.storeId,
    storefrontAddress: {
      regionCode: "KR",
      languageCode: "ko",
      administrativeArea: address.administrativeArea,
      locality: address.locality,
      ...(address.sublocality === undefined
        ? {}
        : { sublocality: address.sublocality }),
      postalCode: address.postalCode,
      addressLines: [profile.address],
    },
    latlng: {
      latitude: address.latitude,
      longitude: address.longitude,
    },
    phoneNumbers: {
      primaryPhone: profile.phone,
    },
    categories: {
      primaryCategory: {
        name: categoryId,
      },
    },
  }
}

const GOOGLE_BUSINESS_ACCOUNT_ID_ENV = "GOOGLE_BUSINESS_ACCOUNT_ID"

const googleLocationsSearchSchema = z
  .object({
    googleLocations: z
      .array(
        z
          .object({
            name: z.string().min(1),
            requestAdminRightsUri: z.string().optional(),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough()

const createdLocationSchema = z
  .object({ name: z.string().min(1) })
  .passthrough()

export async function resolveLiveGbpCredentials(options: {
  readonly env: AdapterEnvironment
  readonly fetchImpl: ExternalFetch
}): Promise<ResolveLiveGbpCredentialsResult> {
  const accountName = resolveGoogleOrgAccountName(options.env)
  const tokenResult = await resolveOrgAccessToken(options)
  if (tokenResult.kind === "blocked_by_credentials") {
    // Report the account-id env var alongside any missing token vars so the
    // owner sees every credential still needed, not just the first gap.
    const missing =
      accountName === undefined
        ? [...tokenResult.missingEnvVars, GOOGLE_BUSINESS_ACCOUNT_ID_ENV]
        : tokenResult.missingEnvVars
    return { kind: "blocked_by_credentials", missingEnvVars: missing }
  }
  if (tokenResult.kind === "auth_failed") {
    return { kind: "auth_failed" }
  }
  if (accountName === undefined) {
    return {
      kind: "blocked_by_credentials",
      missingEnvVars: [GOOGLE_BUSINESS_ACCOUNT_ID_ENV],
    }
  }
  return {
    kind: "ok",
    credentials: { accessToken: tokenResult.accessToken, accountName },
  }
}

async function resolveOrgAccessToken(options: {
  readonly env: AdapterEnvironment
  readonly fetchImpl: ExternalFetch
}): Promise<
  | { readonly kind: "ok"; readonly accessToken: string }
  | {
      readonly kind: "blocked_by_credentials"
      readonly missingEnvVars: readonly string[]
    }
  | { readonly kind: "auth_failed" }
> {
  const provider = createGoogleOrgTokenProvider(options.env, options.fetchImpl)
  try {
    const result = await provider.getAccessToken()
    if (result.kind === "blocked_by_credentials") {
      return {
        kind: "blocked_by_credentials",
        missingEnvVars: result.missingEnvVars,
      }
    }
    return { kind: "ok", accessToken: result.value.accessToken }
  } catch (caught) {
    // A present-but-rejected refresh token (revoked/expired) is an operational
    // reconnect, not a missing credential — keep the two distinguishable.
    if (caught instanceof GoogleOrgTokenError) {
      return { kind: "auth_failed" }
    }
    throw caught
  }
}

export async function runLiveGbpProvisioning(options: {
  readonly adapters: {
    readonly gbpBusinessInformation: GbpBusinessInformationAdapter
  }
  readonly credentials: LiveGbpCredentials
  readonly fetchImpl: ExternalFetch
  readonly location: Readonly<Record<string, unknown>>
  readonly requestId: string
}): Promise<LiveGbpProvisioningResult> {
  // googleLocations:search is best-effort duplicate/claim detection. Google
  // returns sporadic 500 INTERNAL even for well-formed searches, and that must
  // not abort provisioning — a failed search falls back to "no matches" so
  // validate+create still runs (validate itself would still reject a true
  // duplicate). Losing claim detection on a search outage beats blocking setup.
  const search = await executeSearch(options)
  const matches = search.kind === "ok" ? search.result.matches : []

  const claimedMatch = matches.find(
    (match) => match.requestAdminRightsUrl !== undefined
  )
  if (claimedMatch?.requestAdminRightsUrl !== undefined) {
    const claim = await requestAdminRights(options, {
      googleLocationId: claimedMatch.googleLocationId,
      requestAdminRightsUrl: claimedMatch.requestAdminRightsUrl,
    })
    if (claim.kind !== "ok") {
      return claim
    }
    return {
      kind: "claim_required",
      googleLocationId: claimedMatch.googleLocationId,
      requestAdminRightsUrl: claimedMatch.requestAdminRightsUrl,
    }
  }

  const validation = await executeSpecStep(
    () =>
      options.adapters.gbpBusinessInformation.validateLocation({
        accessToken: options.credentials.accessToken,
        accountName: options.credentials.accountName,
        location: options.location,
        requestId: options.requestId,
      }),
    options.fetchImpl
  )
  if (validation.kind !== "ok") {
    return validation
  }

  const creation = await executeSpecStep(
    () =>
      options.adapters.gbpBusinessInformation.createLocation({
        accessToken: options.credentials.accessToken,
        accountName: options.credentials.accountName,
        location: options.location,
        requestId: options.requestId,
      }),
    options.fetchImpl
  )
  if (creation.kind !== "ok") {
    return creation
  }

  const parsed = createdLocationSchema.safeParse(creation.body)
  if (!parsed.success) {
    return upstreamError("Google 위치 생성 응답을 읽지 못했습니다.")
  }
  // A freshly created location is unverified until Google confirms it, so it
  // stays pending — the publish path gates live actions on VERIFIED.
  return {
    kind: "provisioned",
    status: "VERIFICATION_PENDING",
    googleLocationId: parsed.data.name,
  }
}

type SearchStepResult =
  | { readonly kind: "ok"; readonly result: SearchGoogleLocationsResult }
  | { readonly kind: "upstream_error"; readonly message: string }

async function executeSearch(options: {
  readonly adapters: {
    readonly gbpBusinessInformation: GbpBusinessInformationAdapter
  }
  readonly credentials: LiveGbpCredentials
  readonly fetchImpl: ExternalFetch
  readonly location: Readonly<Record<string, unknown>>
}): Promise<SearchStepResult> {
  const adapterResult =
    await options.adapters.gbpBusinessInformation.searchLocations({
      accessToken: options.credentials.accessToken,
      location: options.location,
    })
  if (adapterResult.kind === "blocked_by_credentials") {
    return upstreamError(
      "Google Business Profile 인증 정보가 설정되지 않았습니다."
    )
  }

  const spec = adapterResult.value
  if (isSearchResult(spec)) {
    return { kind: "ok", result: spec }
  }

  const execution = await executeSpec(spec, options.fetchImpl)
  if (execution.kind !== "ok") {
    return execution
  }
  const parsed = googleLocationsSearchSchema.safeParse(execution.body)
  if (!parsed.success) {
    return upstreamError("Google 위치 검색 응답을 읽지 못했습니다.")
  }
  return {
    kind: "ok",
    result: {
      matches: (parsed.data.googleLocations ?? []).map((entry) => ({
        googleLocationId: entry.name,
        ...(entry.requestAdminRightsUri === undefined
          ? {}
          : { requestAdminRightsUrl: entry.requestAdminRightsUri }),
      })),
    },
  }
}

async function requestAdminRights(
  options: {
    readonly adapters: {
      readonly gbpBusinessInformation: GbpBusinessInformationAdapter
    }
    readonly credentials: LiveGbpCredentials
    readonly fetchImpl: ExternalFetch
  },
  claim: {
    readonly googleLocationId: string
    readonly requestAdminRightsUrl: string
  }
): Promise<
  | { readonly kind: "ok" }
  | { readonly kind: "upstream_error"; readonly message: string }
> {
  const result = await executeSpecStep(
    () =>
      options.adapters.gbpBusinessInformation.requestAdminRights({
        accessToken: options.credentials.accessToken,
        googleLocationId: claim.googleLocationId,
        requestAdminRightsUrl: claim.requestAdminRightsUrl,
      }),
    options.fetchImpl
  )
  return result.kind === "ok" ? { kind: "ok" } : result
}

type SpecExecution =
  | { readonly kind: "ok"; readonly body: unknown }
  | { readonly kind: "upstream_error"; readonly message: string }

async function executeSpecStep(
  buildSpec: () => Promise<
    | { readonly kind: "ok"; readonly value: HttpRequestSpec }
    | { readonly kind: "blocked_by_credentials" }
  >,
  fetchImpl: ExternalFetch
): Promise<SpecExecution> {
  const adapterResult = await buildSpec()
  if (adapterResult.kind === "blocked_by_credentials") {
    return upstreamError(
      "Google Business Profile 인증 정보가 설정되지 않았습니다."
    )
  }
  return executeSpec(adapterResult.value, fetchImpl)
}

async function executeSpec(
  spec: HttpRequestSpec,
  fetchImpl: ExternalFetch
): Promise<SpecExecution> {
  let response: Response
  try {
    response = await fetchImpl(spec.url, {
      method: spec.method,
      headers:
        spec.body === undefined
          ? spec.headers
          : { ...spec.headers, "Content-Type": "application/json" },
      ...(spec.body === undefined ? {} : { body: JSON.stringify(spec.body) }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    return upstreamError("Google Business Profile API에 연결하지 못했습니다.")
  }

  if (response.status === 401 || response.status === 403) {
    return upstreamError("Google Business Profile 권한을 다시 연결해주세요.")
  }
  if (response.status === 429) {
    return upstreamError("Google Business Profile 요청 한도를 초과했습니다.")
  }
  if (!response.ok) {
    return upstreamError(
      "Google Business Profile API가 요청을 처리하지 못했습니다."
    )
  }
  return { kind: "ok", body: await readJson(response) }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (caught) {
    if (caught instanceof SyntaxError) {
      return undefined
    }
    throw caught
  }
}

function isSearchResult(
  value: SearchGoogleLocationsResult | HttpRequestSpec
): value is SearchGoogleLocationsResult {
  return "matches" in value
}

function upstreamError(message: string): {
  readonly kind: "upstream_error"
  readonly message: string
} {
  return { kind: "upstream_error", message }
}
