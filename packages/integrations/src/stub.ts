import { Buffer } from "node:buffer"

import type {
  AdapterResult,
  ClockAdapter,
  ContentGenerationAdapter,
  GbpBusinessInformationAdapter,
  GbpLocalPostsAdapter,
  GbpReviewsAdapter,
  GbpVerificationsAdapter,
  GoogleOAuthAdapter,
  JobSchedulerAdapter,
  MarketingGenerationAdapter,
  NaverSearchAdapter,
  NaverSearchResult,
  TranslationAdapter,
} from "./contracts"
import type { OrgLocation } from "./gbp-contracts"
import { createStubMarketingDraft } from "./stub-marketing-generation"
import type { GeocodingAdapter } from "./geocoding-contracts"
import type { AdapterBusinessProfileCandidate } from "@glocalx/domain"

const stubCandidate = {
  candidateId: "naver-local-stub-brunch-moment",
  source: "NAVER_LOCAL",
  sourceInput: "브런치모먼트",
  name: "브런치모먼트 홍대점",
  address: "서울 마포구 와우산로 123",
  category: "브런치 카페",
  phone: "02-123-4567",
  missingFields: ["hours"],
  naverPlaceUrl: "https://naver.me/mybrunchcafe",
} satisfies AdapterBusinessProfileCandidate

const stubSearchQueries = ["브런치모먼트", "mybrunchcafe"] as const
const stubNaverPlaceLinks = [
  "https://naver.me/mybrunchcafe",
  "https://map.naver.com/p/entry/place/123456789",
] as const
const explicitNoResultTerms = ["없는가게", "no-result"] as const

function isStubSearchQuery(query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase()
  return stubSearchQueries.some(
    (stubQuery) => stubQuery.toLowerCase() === normalizedQuery
  )
}

function isStubNaverPlaceLink(input: string | undefined): boolean {
  const normalizedInput = input?.trim().toLowerCase()
  return stubNaverPlaceLinks.some(
    (stubLink) => stubLink.toLowerCase() === normalizedInput
  )
}

function isExplicitNoResult(input: string): boolean {
  const normalizedInput = input.trim().toLowerCase()
  return explicitNoResultTerms.some((term) => normalizedInput.includes(term))
}

function candidateIdFromInput(input: string): string {
  const encoded = Buffer.from(input).toString("base64url").slice(0, 24)
  return `naver-local-stub-${encoded}`
}

function syntheticNameFromInput(input: string): string {
  const normalizedInput = input.trim()
  if (/^https?:\/\//u.test(normalizedInput)) {
    return "네이버 링크 매장"
  }

  if (normalizedInput.endsWith("점")) {
    return normalizedInput
  }

  return `${normalizedInput} 홍대점`
}

function syntheticCandidateForInput(
  input: Parameters<NaverSearchAdapter["searchLocal"]>[0]
): AdapterBusinessProfileCandidate {
  const sourceInput = input.rawInput ?? input.query
  const name = syntheticNameFromInput(input.query)

  return {
    candidateId: candidateIdFromInput(sourceInput),
    source: "NAVER_LOCAL",
    sourceInput,
    name,
    address: "서울 마포구 와우산로 123",
    category: "로컬 매장",
    missingFields: ["phone", "hours"],
    naverPlaceUrl: input.rawInput?.startsWith("http")
      ? input.rawInput
      : `https://map.naver.com/p/search/${encodeURIComponent(input.query)}`,
  }
}

function stubCandidateForInput(
  input: Parameters<NaverSearchAdapter["searchLocal"]>[0]
): AdapterBusinessProfileCandidate {
  const sourceInput = input.rawInput ?? input.query
  return {
    ...stubCandidate,
    sourceInput,
    naverPlaceUrl: isStubNaverPlaceLink(input.rawInput)
      ? sourceInput
      : stubCandidate.naverPlaceUrl,
  }
}

export function createStubNaverSearch(): NaverSearchAdapter {
  return {
    async searchLocal(input): Promise<AdapterResult<NaverSearchResult>> {
      const sourceInput = input.rawInput ?? input.query
      if (isExplicitNoResult(input.query) || isExplicitNoResult(sourceInput)) {
        return {
          kind: "ok",
          value: {
            candidates: [],
          },
        }
      }

      const candidate =
        isStubSearchQuery(input.query) || isStubNaverPlaceLink(input.rawInput)
          ? stubCandidateForInput(input)
          : syntheticCandidateForInput(input)

      if (candidate.name.trim() === "" || candidate.sourceInput.trim() === "") {
        return {
          kind: "ok",
          value: {
            candidates: [],
          },
        }
      }

      return {
        kind: "ok",
        value: {
          candidates: [candidate],
        },
      }
    },
  }
}

export function createStubGoogleOAuth(): GoogleOAuthAdapter {
  return {
    connect() {
      return { kind: "ok", value: { subjectId: "stub-google-owner" } }
    },
  }
}

// Deterministic org-managed listings for the adoption flow. The first entry is a
// deliberate near-match for the demo store (same business, address written the
// way an operator would have typed it by hand) so the matcher is exercised on
// the case it actually exists for; the second is an unrelated listing that must
// never match.
export const stubOrgLocations: readonly OrgLocation[] = [
  {
    name: "locations/stub-org-owned",
    // Mirrors the seeded demo store, but with the address written the long way
    // ("서울특별시" rather than "서울") — the hand-entry variation the matcher
    // has to see through for this flow to be demoable at all.
    title: "브런치모먼트 홍대점",
    addressLine: "서울특별시 마포구 와우산로 123",
    phone: "02-123-4567",
  },
  {
    name: "locations/stub-org-other",
    title: "글로컬엑스 서면점",
    addressLine: "부산 서면로 39",
  },
]

export function createStubBusinessInformation(): GbpBusinessInformationAdapter {
  return {
    async listOrgLocations() {
      return {
        kind: "ok",
        value: { locations: stubOrgLocations },
      }
    },
    async searchLocations() {
      return {
        kind: "ok",
        value: {
          matches: [],
        },
      }
    },
    async requestAdminRights(input) {
      return {
        kind: "ok",
        value: {
          method: "GET",
          url: input.requestAdminRightsUrl,
          headers: {},
          body: {
            googleLocationId: input.googleLocationId,
          },
        },
      }
    },
    async validateLocation(input) {
      return {
        kind: "ok",
        value: {
          method: "POST",
          url: "stub://gbp/locations:validate",
          headers: {},
          body: input.location,
        },
      }
    },
    async createLocation() {
      return {
        kind: "ok",
        value: {
          method: "POST",
          url: "stub://gbp/locations",
          headers: {},
          body: { status: "VERIFICATION_PENDING" },
        },
      }
    },
  }
}

export function createStubGbpVerifications(): GbpVerificationsAdapter {
  // Deterministic request specs with stub:// URLs, mirroring the other GBP stub
  // adapters. The live verification flow (setup-live) only runs under production
  // mode, so these are never executed against a network in stub mode.
  return {
    fetchVerificationOptions(input) {
      return {
        kind: "ok",
        value: {
          method: "POST",
          url: `stub://gbp/${input.locationName}:fetchVerificationOptions`,
          headers: {},
          body: { languageCode: "ko" },
        },
      }
    },
    verify(input) {
      return {
        kind: "ok",
        value: {
          method: "POST",
          url: `stub://gbp/${input.locationName}:verify`,
          headers: {},
          body: { method: input.method, languageCode: "ko" },
        },
      }
    },
    getVoiceOfMerchantState(input) {
      return {
        kind: "ok",
        value: {
          method: "GET",
          url: `stub://gbp/${input.locationName}/VoiceOfMerchantState`,
          headers: {},
        },
      }
    },
  }
}

export function createStubLocalPosts(): GbpLocalPostsAdapter {
  return {
    async createLocalPost() {
      return {
        kind: "ok",
        value: {
          externalPostId: "stub-gbp-post",
          publicUrl: "https://business.google.com/local-post/stub-gbp-post",
        },
      }
    },
  }
}

export function createStubReviews(): GbpReviewsAdapter {
  return {
    listReviews() {
      return {
        kind: "ok",
        value: {
          method: "GET",
          url: "stub://gbp/reviews",
          headers: {},
          body: { rawReviewId: "stub-review" },
        },
      }
    },
    updateReply(input) {
      return {
        kind: "ok",
        value: {
          method: "PUT",
          url: "stub://gbp/reviews/reply",
          headers: {},
          body: { comment: input.comment },
        },
      }
    },
  }
}

export function createStubContentGeneration(): ContentGenerationAdapter {
  return {
    generatePostCopy(intent) {
      return {
        kind: "ok",
        value: {
          korean: `${intent} 소식을 전해드립니다.`,
          english: "Sharing a fresh local-store update for this weekend.",
        },
      }
    },
  }
}

export function createStubMarketingGeneration(): MarketingGenerationAdapter {
  return {
    async generateMarketingDraft(input) {
      return {
        kind: "ok",
        value: createStubMarketingDraft(input),
      }
    },
  }
}

export function createStubTranslation(): TranslationAdapter {
  return {
    translate(text) {
      return { kind: "ok", value: { text } }
    },
  }
}

const geocodeNotFoundTerms = ["지오코딩실패", "geocode-fail"] as const
const geocodeIncompleteTerms = ["우편번호없음", "no-postal"] as const

export function createStubGeocoding(): GeocodingAdapter {
  return {
    async geocodeAddress(input) {
      const normalized = input.address.trim().toLowerCase()
      if (geocodeNotFoundTerms.some((term) => normalized.includes(term))) {
        return { kind: "ok", value: { kind: "not_found" } }
      }
      if (geocodeIncompleteTerms.some((term) => normalized.includes(term))) {
        return {
          kind: "ok",
          value: { kind: "incomplete", missingComponents: ["postal_code"] },
        }
      }
      return {
        kind: "ok",
        value: {
          kind: "resolved",
          address: {
            administrativeArea: "서울특별시",
            locality: "마포구",
            sublocality: "서교동",
            postalCode: "04039",
            latitude: 37.5563,
            longitude: 126.9236,
            formattedAddress: `대한민국 ${input.address}`,
          },
        },
      }
    },
  }
}

export function createStubClock(now: Date): ClockAdapter {
  return {
    now() {
      return now
    },
  }
}

export function createStubJobScheduler(): JobSchedulerAdapter {
  return {
    schedule(jobType) {
      return { kind: "ok", value: { jobId: `stub-job-${jobType}` } }
    },
  }
}
