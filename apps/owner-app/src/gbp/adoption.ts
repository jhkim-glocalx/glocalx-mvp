import type {
  AdapterEnvironment,
  ExternalFetch,
  GbpBusinessInformationAdapter,
} from "@glocalx/integrations/contracts"
import { listOrgLocations } from "@glocalx/integrations/gbp-org-locations"

import {
  findAdoptionMatch,
  type AdoptionMatch,
  type AdoptionCandidateProfile,
} from "./adoption-matching"

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

export async function resolveAdoptionCandidate(options: {
  readonly adapters: {
    readonly gbpBusinessInformation: GbpBusinessInformationAdapter
    readonly mode: string
  }
  readonly env: AdapterEnvironment
  readonly fetchImpl: ExternalFetch
  readonly profile: AdoptionCandidateProfile
}): Promise<ResolveAdoptionResult> {
  const listed = await listOrgLocations({
    adapters: options.adapters,
    env: options.env,
    fetchImpl: options.fetchImpl,
  })
  if (listed.kind !== "ok") {
    return listed
  }

  const match = findAdoptionMatch(options.profile, listed.locations)
  return match === undefined ? { kind: "no_match" } : { kind: "matched", match }
}
