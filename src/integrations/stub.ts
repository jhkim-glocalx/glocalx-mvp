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
  source: "NAVER_LOCAL",
  name: "브런치모먼트 홍대점",
  address: "서울 마포구 와우산로 123",
  category: "브런치 카페",
  phone: "02-123-4567",
  missingFields: ["hours"],
  naverPlaceUrl: "https://naver.me/mybrunchcafe",
} satisfies AdapterBusinessProfileCandidate

const stubSearchQueries = ["브런치모먼트", "mybrunchcafe"] as const

function isStubSearchQuery(query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase()
  return stubSearchQueries.some(
    (stubQuery) => stubQuery.toLowerCase() === normalizedQuery
  )
}

function persistStubExtraction(database: SqliteDatabase | undefined): void {
  if (database === undefined) {
    return
  }

  database
    .prepare(
      "INSERT OR IGNORE INTO business_profile_extractions (id, store_id, source, source_input, status, candidate_json, missing_fields_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      "stub-extraction-brunch-moment",
      "demo-store",
      "NAVER_LOCAL",
      "브런치모먼트",
      "CANDIDATES_FOUND",
      JSON.stringify(stubCandidate),
      JSON.stringify(stubCandidate.missingFields),
      "2026-06-04T00:00:00.000Z"
    )
}

export function createStubNaverSearch(
  database?: SqliteDatabase
): NaverSearchAdapter {
  return {
    searchLocal(input): AdapterResult<NaverSearchResult> {
      if (!isStubSearchQuery(input.query)) {
        return {
          kind: "ok",
          value: {
            candidates: [],
          },
        }
      }

      persistStubExtraction(database)
      return {
        kind: "ok",
        value: {
          candidates: [stubCandidate],
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
    createLocation() {
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
