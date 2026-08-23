import { z } from "zod"

import type {
  AdapterEnvironment,
  ExternalFetch,
  HttpRequestSpec,
} from "./contracts"
import type {
  GbpBusinessInformationAdapter,
  ListOrgLocationsResult,
  OrgLocation,
} from "./gbp-contracts"
import {
  createGoogleOrgTokenProvider,
  GoogleOrgTokenError,
  resolveGoogleOrgAccountName,
} from "./google-org-auth"

// Reading the org account's own listings. Both apps need this — the owner app to
// match a "이미 등록했어요" claim against it, the operator console to offer the
// listing picker — so it lives at the adapter boundary rather than being copied
// into each app with its own idea of how to execute a request spec.

export type ListOrgLocationsOutcome =
  | { readonly kind: "ok"; readonly locations: readonly OrgLocation[] }
  | {
      readonly kind: "blocked_by_credentials"
      readonly missingEnvVars: readonly string[]
    }
  | { readonly kind: "upstream_error"; readonly message: string }

// One page is enough for the operation this exists for — a hand-built org
// account with tens of listings, not thousands.
const orgLocationsPageSize = 100

const orgLocationsResponseSchema = z.object({
  locations: z
    .array(
      z
        .object({
          name: z.string().min(1),
          title: z.string().optional(),
          storefrontAddress: z
            .object({ addressLines: z.array(z.string()).optional() })
            .passthrough()
            .optional(),
          phoneNumbers: z
            .object({ primaryPhone: z.string().optional() })
            .passthrough()
            .optional(),
        })
        .passthrough()
    )
    .optional(),
})

function toOrgLocations(body: unknown): readonly OrgLocation[] {
  const parsed = orgLocationsResponseSchema.safeParse(body)
  if (!parsed.success) {
    return []
  }
  return (parsed.data.locations ?? []).map((location) => {
    const phone = location.phoneNumbers?.primaryPhone
    return {
      name: location.name,
      title: location.title ?? "",
      addressLine: (location.storefrontAddress?.addressLines ?? []).join(" "),
      ...(phone === undefined ? {} : { phone }),
    }
  })
}

function isListResult(
  value: ListOrgLocationsResult | HttpRequestSpec
): value is ListOrgLocationsResult {
  return "locations" in value
}

type ResolvedCredentials =
  | {
      readonly kind: "ok"
      readonly accessToken: string
      readonly accountName: string
    }
  | {
      readonly kind: "blocked_by_credentials"
      readonly missingEnvVars: readonly string[]
    }
  | { readonly kind: "auth_failed" }

async function resolveCredentials(
  mode: string,
  env: AdapterEnvironment,
  fetchImpl: ExternalFetch
): Promise<ResolvedCredentials> {
  // Only the live path needs an org token; the stub adapter answers from canned
  // locations. Resolving credentials unconditionally would make this undemoable
  // in stub mode, which is where it gets reviewed.
  if (mode !== "production") {
    return {
      kind: "ok",
      accessToken: "stub-access-token",
      accountName: "accounts/stub",
    }
  }

  const accountName = resolveGoogleOrgAccountName(env)
  if (accountName === undefined) {
    return {
      kind: "blocked_by_credentials",
      missingEnvVars: ["GOOGLE_BUSINESS_ACCOUNT_ID"],
    }
  }

  try {
    const token = await createGoogleOrgTokenProvider(
      env,
      fetchImpl
    ).getAccessToken()
    if (token.kind === "blocked_by_credentials") {
      return {
        kind: "blocked_by_credentials",
        missingEnvVars: token.missingEnvVars,
      }
    }
    return { kind: "ok", accessToken: token.value.accessToken, accountName }
  } catch (error) {
    // A present-but-rejected credential is a reconnect problem, not a
    // configuration one, and the two need different operator instructions.
    if (error instanceof GoogleOrgTokenError) {
      return { kind: "auth_failed" }
    }
    throw error
  }
}

export async function listOrgLocations(options: {
  readonly adapters: {
    readonly gbpBusinessInformation: GbpBusinessInformationAdapter
    readonly mode: string
  }
  readonly env: AdapterEnvironment
  readonly fetchImpl: ExternalFetch
}): Promise<ListOrgLocationsOutcome> {
  const credentials = await resolveCredentials(
    options.adapters.mode,
    options.env,
    options.fetchImpl
  )
  if (credentials.kind === "blocked_by_credentials") {
    return {
      kind: "blocked_by_credentials",
      missingEnvVars: credentials.missingEnvVars,
    }
  }
  if (credentials.kind === "auth_failed") {
    return {
      kind: "upstream_error",
      message: "Google Business Profile 권한을 다시 연결해주세요.",
    }
  }

  const listResult =
    await options.adapters.gbpBusinessInformation.listOrgLocations({
      accessToken: credentials.accessToken,
      accountName: credentials.accountName,
      pageSize: orgLocationsPageSize,
    })
  if (listResult.kind === "blocked_by_credentials") {
    return {
      kind: "blocked_by_credentials",
      missingEnvVars: listResult.missingEnvVars,
    }
  }

  // Stub mode hands back concrete locations; production hands back a request
  // spec this boundary executes with the org token.
  if (isListResult(listResult.value)) {
    return { kind: "ok", locations: listResult.value.locations }
  }

  const executed = await executeSpec(listResult.value, options.fetchImpl)
  return executed === undefined
    ? {
        kind: "upstream_error",
        message: "Google Business Profile 목록을 불러오지 못했습니다.",
      }
    : { kind: "ok", locations: toOrgLocations(executed) }
}

async function executeSpec(
  spec: HttpRequestSpec,
  fetchImpl: ExternalFetch
): Promise<unknown | undefined> {
  let response: Response
  try {
    response = await fetchImpl(spec.url, {
      method: spec.method,
      headers: spec.headers,
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    return undefined
  }
  if (!response.ok) {
    return undefined
  }
  try {
    return await response.json()
  } catch {
    return undefined
  }
}
