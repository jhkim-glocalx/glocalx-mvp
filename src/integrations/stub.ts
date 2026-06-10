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
  MarketingGenerationAdapter,
  MarketingGenerationInput,
  MarketingGenerationResult,
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

      if (candidate.name.trim() === "" || candidate.sourceInput.trim() === "") {
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

function splitIntentKeywords(intent: string): readonly string[] {
  const normalized = intent
    .replace(/[^\p{L}\p{N}\s#]/gu, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^#/, "").trim())
    .filter((word) => word.length >= 2)

  const defaults = ["브런치", "주말", "신메뉴"]
  return Array.from(new Set([...normalized, ...defaults])).slice(0, 5)
}

function createStubMarketingDraft(
  input: MarketingGenerationInput
): MarketingGenerationResult {
  const keywords = splitIntentKeywords(input.ownerIntent)
  const primaryAssetId = input.imageAssets[0]?.id ?? null
  const acceptedSuggestion = input.suggestionMode === "accepted"
  const copyIntent = acceptedSuggestion
    ? `${input.ownerIntent} 음식 클로즈업을 강조`
    : input.ownerIntent
  const hashtags = [
    "#홍대브런치",
    "#주말브런치",
    `#${keywords[0] ?? "브런치"}`,
    "#hongdaecafe",
  ]

  return {
    intentAnalysis: {
      audience: "이번 주말 홍대에서 브런치와 카페를 찾는 방문객",
      keywords,
      objective: acceptedSuggestion
        ? "신메뉴의 식감과 가까운 비주얼을 강조한 방문 유도"
        : "주말 신메뉴 프로모션으로 방문 예약과 저장을 유도",
      promotionWindow: "이번 주말",
      tone: "따뜻하고 선명한 매장 추천 톤",
    },
    images: input.imageAssets.map((asset, index) => ({
      altText: `${input.storeName} ${keywords[0] ?? "브런치"} 홍보 이미지 ${index + 1}`,
      assetId: asset.id,
      cropFocus:
        index === 0 ? "메인 메뉴 중심 1:1" : "매장 분위기와 테이블 여백",
      cssFilter:
        index === 0
          ? "contrast(1.08) saturate(1.16) brightness(1.04)"
          : "contrast(1.04) saturate(1.1) brightness(1.03)",
      editedLabel: index === 0 ? "선명도 + 메뉴 집중" : "밝기 + 색감 정리",
      editSummary:
        index === 0
          ? "대표 메뉴가 먼저 보이도록 선명도와 따뜻한 색감을 올렸습니다."
          : "전체 톤을 밝게 정리하고 플랫폼 크롭에 맞춰 중심을 잡았습니다.",
      originalLabel: asset.name,
      qualityScore: Math.max(82, 94 - index * 4),
    })),
    suggestion:
      input.suggestionMode !== "request"
        ? null
        : {
            id: "suggest-closeup-weekend-menu",
            message:
              "대표 메뉴 클로즈업을 첫 장으로 쓰면 GBP와 인스타그램 모두에서 메뉴 인지가 더 빨라집니다.",
            ownerAction: "첫 번째 이미지를 메뉴 클로즈업 중심으로 사용",
            rationale:
              "업로드된 이미지와 의도상 주말 신메뉴가 핵심이라 첫 화면에서 음식 디테일을 크게 보여주는 편이 전환에 유리합니다.",
            revisedIntent: `${input.ownerIntent} · 대표 메뉴 클로즈업 강조`,
            title: "대표 메뉴 클로즈업을 첫 장으로 배치",
          },
    platformPreviews: [
      {
        aspectRatio: "4:3",
        callToAction: "길찾기와 저장을 유도",
        copy: `${input.storeName}에서 ${copyIntent} 소식을 전해드립니다. 따뜻한 브런치와 커피를 이번 주말 홍대에서 만나보세요.`,
        hashtags: hashtags.slice(0, 3),
        imageAssetId: primaryAssetId,
        label: "Google 비즈니스 프로필",
        platform: "GBP",
        uploadNotes: ["짧은 첫 문장", "매장명 포함", "주말 방문 의도 강조"],
      },
      {
        aspectRatio: "1:1",
        callToAction: "저장과 공유를 유도",
        copy: `이번 주말, ${input.storeName}의 신메뉴로 브런치 약속을 완성해보세요. 부드러운 메뉴컷과 따뜻한 매장 분위기를 함께 담았습니다.`,
        hashtags,
        imageAssetId: primaryAssetId,
        label: "Instagram 피드",
        platform: "INSTAGRAM",
        uploadNotes: ["첫 장 메뉴 클로즈업", "해시태그 4개", "피드 1:1 크롭"],
      },
    ],
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
