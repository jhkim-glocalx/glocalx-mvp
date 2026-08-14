import type { OrgLocation } from "@glocalx/integrations/gbp-contracts"

// Matching an owner's "이미 등록했어요" claim against the listings the org
// account already manages.
//
// This is a *narrowing* step, never an authorization: nothing here attaches a
// listing. Its job is to hand an operator one candidate to rule on, and — just
// as importantly — to keep the org's other customers out of the response. An
// owner must never learn that a business they did not name is managed here, so
// the caller returns at most the single best match and never the candidate list.
//
// Deliberately not fuzzy-scoring free text: a listing set up by hand carries the
// same phone number and roughly the same address as the store row the owner just
// confirmed, and phone is the one field that is either equal or not.

export type AdoptionCandidateProfile = {
  readonly name: string
  readonly address: string
  readonly phone: string
}

export type AdoptionMatch = {
  readonly location: OrgLocation
  // Why this location matched, surfaced to the operator so the verdict is made
  // on evidence rather than on the app's say-so.
  readonly evidence: readonly AdoptionEvidence[]
}

export type AdoptionEvidence = "phone" | "name" | "address"

// Korean addresses vary by whether the writer used the full administrative name
// ("서울특별시" vs "서울"), and hand-entered listings are exactly where that
// variation shows up. Normalizing to comparable tokens keeps those the same
// address without resorting to a similarity threshold nobody can reason about.
const addressPrefixAliases: readonly (readonly [RegExp, string])[] = [
  [/^서울특별시/, "서울"],
  [/^부산광역시/, "부산"],
  [/^대구광역시/, "대구"],
  [/^인천광역시/, "인천"],
  [/^광주광역시/, "광주"],
  [/^대전광역시/, "대전"],
  [/^울산광역시/, "울산"],
  [/^세종특별자치시/, "세종"],
  [/^제주특별자치도/, "제주"],
  [/^경기도/, "경기"],
  [/^강원특별자치도/, "강원"],
  [/^강원도/, "강원"],
]

function normalizeText(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase()
}

function normalizeAddress(value: string): string {
  const trimmed = value.trim()
  const aliased = addressPrefixAliases.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    trimmed
  )
  return normalizeText(aliased)
}

// Korean numbers are written with or without hyphens and sometimes with a +82
// country code; comparing digits alone makes those the same number.
function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "")
  return digits.startsWith("82") ? `0${digits.slice(2)}` : digits
}

function collectEvidence(
  profile: AdoptionCandidateProfile,
  location: OrgLocation
): readonly AdoptionEvidence[] {
  const evidence: AdoptionEvidence[] = []
  if (
    location.phone !== undefined &&
    normalizePhone(location.phone) !== "" &&
    normalizePhone(location.phone) === normalizePhone(profile.phone)
  ) {
    evidence.push("phone")
  }
  if (normalizeText(location.title) === normalizeText(profile.name)) {
    evidence.push("name")
  }
  if (
    normalizeAddress(location.addressLine) === normalizeAddress(profile.address)
  ) {
    evidence.push("address")
  }
  return evidence
}

// Two independent signals, not one. A shared phone alone catches franchise
// branches that share a head-office number; a shared name alone catches every
// "OO커피 OO점". Requiring two makes an accidental match need two coincidences,
// and the operator still rules on it either way.
const requiredEvidenceCount = 2

export function findAdoptionMatch(
  profile: AdoptionCandidateProfile,
  locations: readonly OrgLocation[]
): AdoptionMatch | undefined {
  const scored = locations
    .map((location) => ({
      location,
      evidence: collectEvidence(profile, location),
    }))
    .filter((candidate) => candidate.evidence.length >= requiredEvidenceCount)
    .sort((left, right) => right.evidence.length - left.evidence.length)

  // Ambiguity is an operator problem, not something to guess at: if two org
  // listings match equally well, returning either one would attach a store to a
  // coin flip. Report nothing and let the claim fall through to a human.
  if (scored.length === 0) {
    return undefined
  }
  if (
    scored.length > 1 &&
    scored[1] !== undefined &&
    scored[0] !== undefined &&
    scored[1].evidence.length === scored[0].evidence.length
  ) {
    return undefined
  }
  return scored[0]
}
