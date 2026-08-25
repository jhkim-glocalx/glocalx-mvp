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

const orgLocationsPageSize = 100

// The org account can outgrow one page (e.g. past 100 listings) as we onboard
// more stores, so this caps how many pages a single picker load will follow
// rather than how many locations the org may have — a runaway/looping
// nextPageToken stops here instead of hanging the request.
const maxOrgLocationsPages = 50

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
  nextPageToken: z.string().optional(),
})

type ParsedOrgLocationsPage = {
  readonly locations: readonly OrgLocation[]
  readonly nextPageToken?: string
}

function toOrgLocations(body: unknown): ParsedOrgLocationsPage {
  const parsed = orgLocationsResponseSchema.safeParse(body)
  if (!parsed.success) {
    return { locations: [] }
  }
  const locations = (parsed.data.locations ?? []).map((location) => {
    const phone = location.phoneNumbers?.primaryPhone
    return {
      name: location.name,
      title: location.title ?? "",
      addressLine: (location.storefrontAddress?.addressLines ?? []).join(" "),
      ...(phone === undefined ? {} : { phone }),
    }
  })
  return {
    locations,
    ...(parsed.data.nextPageToken === undefined
      ? {}
      : { nextPageToken: parsed.data.nextPageToken }),
  }
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

  const locations: OrgLocation[] = []
  let pageToken: string | undefined
  for (let page = 0; page < maxOrgLocationsPages; page += 1) {
    const listResult =
      await options.adapters.gbpBusinessInformation.listOrgLocations({
        accessToken: credentials.accessToken,
        accountName: credentials.accountName,
        pageSize: orgLocationsPageSize,
        ...(pageToken === undefined ? {} : { pageToken }),
      })
    if (listResult.kind === "blocked_by_credentials") {
      return {
        kind: "blocked_by_credentials",
        missingEnvVars: listResult.missingEnvVars,
      }
    }

    // Stub mode hands back concrete locations; production hands back a
    // request spec this boundary executes with the org token.
    if (isListResult(listResult.value)) {
      locations.push(...listResult.value.locations)
      pageToken = listResult.value.nextPageToken
    } else {
      const executed = await executeSpec(listResult.value, options.fetchImpl)
      if (executed === undefined) {
        return {
          kind: "upstream_error",
          message: "Google Business Profile 목록을 불러오지 못했습니다.",
        }
      }
      const parsedPage = toOrgLocations(executed)
      locations.push(...parsedPage.locations)
      pageToken = parsedPage.nextPageToken
    }

    if (pageToken === undefined) {
      return { kind: "ok", locations }
    }
  }

  // Hit the page cap without exhausting nextPageToken — return what was
  // gathered rather than looping forever or dropping the org's tail
  // silently; a truncated-but-large picker is a better failure than a hang.
  return { kind: "ok", locations }
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
