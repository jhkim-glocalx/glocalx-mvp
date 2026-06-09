import { Buffer } from "node:buffer"

import type {
  AdapterResult,
  ClockAdapter,
  ContentGenerationAdapter,
  GbpBusinessInformationAdapter,
  GbpLocalPostsAdapter,
  GbpReviewsAdapter,
  GoogleOAuthAdapter,
  JobSchedulerAdapter,
  NaverSearchAdapter,
  NaverSearchResult,
  TranslationAdapter,
} from "./contracts"
import type { AdapterBusinessProfileCandidate } from "@/domain/schemas"
import type { SqliteDatabase } from "@/server/db/sqlite"

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

function persistStubExtraction(
  database: SqliteDatabase | undefined,
  candidate: AdapterBusinessProfileCandidate
): void {
  if (database === undefined) {
    return
  }

  database
    .prepare(
      "INSERT OR IGNORE INTO business_profile_extractions (id, store_id, source, source_input, status, candidate_json, missing_fields_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      `stub-extraction-${candidate.candidateId}`,
      "demo-store",
      "NAVER_LOCAL",
      candidate.sourceInput,
      "CANDIDATES_FOUND",
      JSON.stringify(candidate),
      JSON.stringify(candidate.missingFields),
      "2026-06-04T00:00:00.000Z"
    )
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

export function createStubNaverSearch(
  database?: SqliteDatabase
): NaverSearchAdapter {
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

      if (
        candidate.name.trim() === "" ||
        candidate.sourceInput.trim() === ""
      ) {
        return {
          kind: "ok",
          value: {
            candidates: [],
          },
        }
      }

      persistStubExtraction(database, candidate)
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

export function createStubBusinessInformation(): GbpBusinessInformationAdapter {
  return {
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

export function createStubLocalPosts(): GbpLocalPostsAdapter {
  return {
    createLocalPost(input) {
      return {
        kind: "ok",
        value: {
          method: "POST",
          url: "stub://gbp/localPosts",
          headers: {},
          body: {
            summary: input.summary,
            gbpPostId: "stub-gbp-post",
            publicUrl: "https://business.google.com/local-post/stub-gbp-post",
          },
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
          english: `Sharing this update: ${intent}`,
        },
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
