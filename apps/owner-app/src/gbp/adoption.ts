import { z } from "zod"

import type {
  AdapterEnvironment,
  ExternalFetch,
  GbpBusinessInformationAdapter,
  ListOrgLocationsResult,
  OrgLocation,
} from "@glocalx/integrations/contracts"
import type { HttpRequestSpec } from "@glocalx/integrations/contracts"

import {
  findAdoptionMatch,
  type AdoptionMatch,
  type AdoptionCandidateProfile,
} from "./adoption-matching"
import { executeSpec, resolveLiveGbpCredentials } from "./setup-live"

// Resolving an owner's "이미 등록했어요" claim against the org account's own
// listings. Everything here runs server-side and returns at most one match: the
// full org listing set includes other customers' businesses and must never reach
// an owner's browser.

export type ResolveAdoptionResult =
  | { readonly kind: "matched"; readonly match: AdoptionMatch }
  | { readonly kind: "no_match" }
  | {
      readonly kind: "blocked_by_credentials"
      readonly missingEnvVars: readonly string[]
    }
  | { readonly kind: "upstream_error"; readonly message: string }

// One page is enough for the operation this exists for — a hand-built org
// account with tens of listings, not thousands. Paging past this would trade a
// slower owner-facing request for candidates that a two-signal match on a store
// the operator personally set up will not need.
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

export async function resolveAdoptionCandidate(options: {
  readonly adapters: {
    readonly gbpBusinessInformation: GbpBusinessInformationAdapter
    readonly mode: string
  }
  readonly env: AdapterEnvironment
  readonly fetchImpl: ExternalFetch
  readonly profile: AdoptionCandidateProfile
}): Promise<ResolveAdoptionResult> {
  // Only the live path needs an org token; the stub adapter answers from canned
  // locations. Resolving credentials unconditionally would make the whole
  // adoption flow undemoable in stub mode, which is where it gets reviewed.
  const credentials =
    options.adapters.mode === "production"
      ? await resolveLiveGbpCredentials({
          env: options.env,
          fetchImpl: options.fetchImpl,
        })
      : ({
          kind: "ok",
          credentials: {
            accessToken: "stub-access-token",
            accountName: "accounts/stub",
          },
        } as const)

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
      accessToken: credentials.credentials.accessToken,
      accountName: credentials.credentials.accountName,
      pageSize: orgLocationsPageSize,
    })
  if (listResult.kind === "blocked_by_credentials") {
    return {
      kind: "blocked_by_credentials",
      missingEnvVars: listResult.missingEnvVars,
    }
  }

  // Stub mode hands back concrete locations; production hands back a request
  // spec this boundary executes with the org token (the setup-live pattern).
  const locations = isListResult(listResult.value)
    ? listResult.value.locations
    : await executeAndParse(listResult.value, options.fetchImpl)
  if (locations === undefined) {
    return {
      kind: "upstream_error",
      message: "Google Business Profile 목록을 불러오지 못했습니다.",
    }
  }

  const match = findAdoptionMatch(options.profile, locations)
  return match === undefined ? { kind: "no_match" } : { kind: "matched", match }
}

async function executeAndParse(
  spec: HttpRequestSpec,
  fetchImpl: ExternalFetch
): Promise<readonly OrgLocation[] | undefined> {
  const execution = await executeSpec(spec, fetchImpl)
  return execution.kind === "ok" ? toOrgLocations(execution.body) : undefined
}
