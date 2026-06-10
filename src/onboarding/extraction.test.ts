import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"

import type { AdapterBusinessProfileCandidate } from "@/domain/schemas"
import type {
  AdapterResult,
  HttpRequestSpec,
  NaverSearchAdapter,
  NaverSearchResult,
} from "@/integrations/contracts"
import { createIntegrationAdapters } from "@/integrations"
import { applyMigrations, openDatabase, seedDemoData } from "@/server/db/sqlite"

import { NaverSearchTimeoutError, extractBusinessProfile } from "./extraction"

const countRowSchema = z.object({
  count: z.number(),
})

const ambiguousCandidates = [
  {
    candidateId: "naver-local-hongdae",
    source: "NAVER_LOCAL",
    sourceInput: "브런치모먼트",
    name: "브런치모먼트 홍대점",
    address: "서울 마포구 와우산로 123",
    category: "브런치 카페",
    missingFields: ["phone", "hours"],
  },
  {
    candidateId: "naver-local-yeonnam",
    source: "NAVER_LOCAL",
    sourceInput: "브런치모먼트",
    name: "브런치모먼트 연남점",
    address: "서울 마포구 연남로 45",
    category: "브런치 카페",
    missingFields: ["phone", "hours"],
  },
] satisfies readonly AdapterBusinessProfileCandidate[]

function fakeNaverSearch(
  result: AdapterResult<NaverSearchResult | HttpRequestSpec>
): NaverSearchAdapter {
  return {
    async searchLocal(): Promise<
      AdapterResult<NaverSearchResult | HttpRequestSpec>
    > {
      return result
    },
  }
}

function timeoutNaverSearch(): NaverSearchAdapter {
  return {
    async searchLocal(): Promise<
      AdapterResult<NaverSearchResult | HttpRequestSpec>
    > {
      throw new NaverSearchTimeoutError("브런치모먼트")
    },
  }
}

describe("extractBusinessProfile", () => {
  const tempPaths: string[] = []

  afterEach(async () => {
    for (const tempPath of tempPaths) {
      await rm(tempPath, { force: true, recursive: true })
    }
    tempPaths.length = 0
  })

  it("returns normalized stub candidates when a Naver short link is provided", async () => {
    // Given
    const tempPath = await mkdtemp(join(tmpdir(), "glocalx-naver-link-"))
    tempPaths.push(tempPath)
    const database = openDatabase(join(tempPath, "naver.db"))
    applyMigrations(database)
    seedDemoData(database)
    const adapters = createIntegrationAdapters({ database, env: {} })

    // When
    const result = await extractBusinessProfile({
      adapters,
      database,
      input: "https://naver.me/mybrunchcafe",
      storeId: "demo-store",
    })

    // Then
    expect(result.status).toBe("CANDIDATES_FOUND")
    if (result.status === "CANDIDATES_FOUND") {
      expect(result.normalizedQuery).toBe("mybrunchcafe")
      expect(result.candidates[0]?.name).toBe("브런치모먼트 홍대점")
      expect(result.candidates[0]?.missingFields).toEqual(["hours"])
      expect(result.requiresSelection).toBe(false)
    }

    const countRow = countRowSchema.parse(
      database
        .prepare("SELECT COUNT(*) AS count FROM business_profile_extractions")
        .get()
    )
    expect(countRow.count).toBe(2)
    database.close()
  })

  it("returns deterministic stub candidates for ordinary store names", async () => {
    // Given
    const adapters = createIntegrationAdapters({ env: {} })

    // When
    const result = await extractBusinessProfile({
      adapters,
      input: "서울커피",
      storeId: "demo-store",
    })

    // Then
    expect(result.status).toBe("CANDIDATES_FOUND")
    if (result.status === "CANDIDATES_FOUND") {
      expect(result.normalizedQuery).toBe("서울커피")
      expect(result.candidates[0]).toMatchObject({
        source: "NAVER_LOCAL",
        sourceInput: "서울커피",
        name: "서울커피 홍대점",
        address: "서울 마포구 와우산로 123",
        category: "로컬 매장",
        missingFields: ["phone", "hours"],
      })
    }
  })

  it("returns manual recovery copy when Naver has no result", async () => {
    // Given
    const adapters = createIntegrationAdapters({ env: {} })

    // When
    const result = await extractBusinessProfile({
      adapters,
      input: "없는가게zzzz",
      storeId: "demo-store",
    })

    // Then
    expect(result).toEqual({
      status: "MANUAL_INPUT_REQUIRED",
      normalizedQuery: "없는가게zzzz",
      candidates: [],
      manualForm: {
        requiredFields: ["name", "address", "category"],
        promptedFields: ["phone", "hours"],
      },
      message:
        "네이버에서 매장을 찾지 못했습니다. 직접 입력으로 계속할 수 있습니다.",
    })
  })

  it("requires explicit owner selection when Naver returns ambiguous matches", async () => {
    // Given
    const adapters = {
      ...createIntegrationAdapters({ env: {} }),
      naverSearch: fakeNaverSearch({
        kind: "ok",
        value: { candidates: ambiguousCandidates },
      }),
    }

    // When
    const result = await extractBusinessProfile({
      adapters,
      input: "브런치모먼트",
      storeId: "demo-store",
    })

    // Then
    expect(result.status).toBe("CANDIDATES_FOUND")
    if (result.status === "CANDIDATES_FOUND") {
      expect(result.requiresSelection).toBe(true)
      expect(result.message).toBe(
        "여러 매장이 검색되었습니다. 소유한 매장을 선택해주세요."
      )
    }
  })

  it("deduplicates repeated Naver candidates before rendering choices", async () => {
    // Given
    const duplicateCandidate = ambiguousCandidates[0] as AdapterBusinessProfileCandidate
    const adapters = {
      ...createIntegrationAdapters({ env: {} }),
      naverSearch: fakeNaverSearch({
        kind: "ok",
        value: { candidates: [duplicateCandidate, duplicateCandidate] },
      }),
    }

    // When
    const result = await extractBusinessProfile({
      adapters,
      input: "브런치모먼트",
      storeId: "demo-store",
    })

    // Then
    expect(result.status).toBe("CANDIDATES_FOUND")
    if (result.status === "CANDIDATES_FOUND") {
      expect(result.candidates).toHaveLength(1)
      expect(result.candidates[0]?.candidateId).toBe("naver-local-hongdae")
      expect(result.requiresSelection).toBe(false)
    }
  })

  it("returns manual recovery copy when the Naver search times out", async () => {
    // Given
    const adapters = {
      ...createIntegrationAdapters({ env: {} }),
      naverSearch: timeoutNaverSearch(),
    }

    // When
    const result = await extractBusinessProfile({
      adapters,
      input: "브런치모먼트",
      storeId: "demo-store",
    })

    // Then
    expect(result.status).toBe("MANUAL_INPUT_REQUIRED")
    if (result.status === "MANUAL_INPUT_REQUIRED") {
      expect(result.message).toBe(
        "네이버 검색 응답이 지연되고 있습니다. 직접 입력으로 계속할 수 있습니다."
      )
      expect(result.manualForm.requiredFields).toEqual([
        "name",
        "address",
        "category",
      ])
    }
  })

  it("passes opaque Naver place URLs through the adapter", async () => {
    // Given
    const adapters = createIntegrationAdapters({ env: {} })

    // When
    const result = await extractBusinessProfile({
      adapters,
      input: "https://map.naver.com/p/entry/place/123456789",
      storeId: "demo-store",
    })

    // Then
    expect(result.status).toBe("CANDIDATES_FOUND")
    if (result.status === "CANDIDATES_FOUND") {
      expect(result.normalizedQuery).toBe("p/entry/place/123456789")
      expect(result.candidates[0]).toMatchObject({
        sourceInput: "https://map.naver.com/p/entry/place/123456789",
        naverPlaceUrl: "https://map.naver.com/p/entry/place/123456789",
        name: "브런치모먼트 홍대점",
      })
    }
  })

  it("returns manual recovery copy when production Naver responds with an HTTP error", async () => {
    // Given
    const adapters = createIntegrationAdapters({
      env: {
        APP_INTEGRATION_MODE: "production",
        NAVER_CLIENT_ID: "test-naver-client",
        NAVER_CLIENT_SECRET: "test-naver-secret",
      },
      fetchImpl: async () => new Response(null, { status: 429 }),
    })

    // When
    const result = await extractBusinessProfile({
      adapters,
      input: "브런치모먼트",
      storeId: "demo-store",
    })

    // Then
    expect(result.status).toBe("MANUAL_INPUT_REQUIRED")
    if (result.status === "MANUAL_INPUT_REQUIRED") {
      expect(result.message).toBe(
        "네이버 검색 응답이 지연되고 있습니다. 직접 입력으로 계속할 수 있습니다."
      )
    }
  })

  it("falls back to production Naver local search when place detail lookup is rejected", async () => {
    // Given
    const requestedUrls: string[] = []
    const adapters = createIntegrationAdapters({
      env: {
        APP_INTEGRATION_MODE: "production",
        NAVER_CLIENT_ID: "test-naver-client",
        NAVER_CLIENT_SECRET: "test-naver-secret",
      },
      fetchImpl: async (input) => {
        requestedUrls.push(input)
        if (input.startsWith("https://pcmap.place.naver.com/place/")) {
          return new Response(null, { status: 429 })
        }

        return new Response(
          JSON.stringify({
            items: [
              {
                title: "<b>브런치모먼트</b> 홍대점",
                link: "https://map.naver.com/p/entry/place/123456789",
                category: "음식점>카페",
                telephone: "",
                address: "서울 마포구 서교동 1",
                roadAddress: "서울 마포구 와우산로 123",
                mapx: "126923456",
                mapy: "37551234",
              },
            ],
          })
        )
      },
    })

    // When
    const result = await extractBusinessProfile({
      adapters,
      input: "https://map.naver.com/p/entry/place/123456789",
      storeId: "demo-store",
    })

    // Then
    expect(result.status).toBe("CANDIDATES_FOUND")
    expect(requestedUrls[0]).toBe(
      "https://pcmap.place.naver.com/place/123456789/home"
    )
    expect(requestedUrls[1]).toContain(
      "https://openapi.naver.com/v1/search/local.json"
    )
    if (result.status === "CANDIDATES_FOUND") {
      expect(result.candidates[0]).toMatchObject({
        source: "NAVER_LOCAL",
        sourceInput: "https://map.naver.com/p/entry/place/123456789",
        name: "브런치모먼트 홍대점",
        address: "서울 마포구 와우산로 123",
        category: "음식점>카페",
        naverPlaceUrl: "https://map.naver.com/p/entry/place/123456789",
      })
    }
  })

  it("returns manual recovery copy when production Naver fetch times out", async () => {
    // Given
    const adapters = createIntegrationAdapters({
      env: {
        APP_INTEGRATION_MODE: "production",
        NAVER_CLIENT_ID: "test-naver-client",
        NAVER_CLIENT_SECRET: "test-naver-secret",
      },
      fetchImpl: async () => {
        throw new DOMException("Naver local search timed out", "TimeoutError")
      },
    })

    // When
    const result = await extractBusinessProfile({
      adapters,
      input: "브런치모먼트",
      storeId: "demo-store",
    })

    // Then
    expect(result.status).toBe("MANUAL_INPUT_REQUIRED")
    if (result.status === "MANUAL_INPUT_REQUIRED") {
      expect(result.manualForm.requiredFields).toEqual([
        "name",
        "address",
        "category",
      ])
    }
  })

  it("returns normalized candidates from production Naver local search", async () => {
    // Given
    const adapters = createIntegrationAdapters({
      env: {
        APP_INTEGRATION_MODE: "production",
        NAVER_CLIENT_ID: "test-naver-client",
        NAVER_CLIENT_SECRET: "test-naver-secret",
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                title: "<b>브런치모먼트</b> 홍대점",
                link: "https://map.naver.com/p/entry/place/123",
                category: "음식점>카페",
                telephone: "",
                address: "서울 마포구 서교동 1",
                roadAddress: "서울 마포구 와우산로 123",
                mapx: "126923456",
                mapy: "37551234",
              },
            ],
          })
        ),
    })

    // When
    const result = await extractBusinessProfile({
      adapters,
      input: "브런치모먼트",
      storeId: "demo-store",
    })

    // Then
    expect(result.status).toBe("CANDIDATES_FOUND")
    if (result.status === "CANDIDATES_FOUND") {
      expect(result.candidates[0]).toMatchObject({
        source: "NAVER_LOCAL",
        sourceInput: "브런치모먼트",
        name: "브런치모먼트 홍대점",
        address: "서울 마포구 와우산로 123",
        category: "음식점>카페",
        naverPlaceUrl: "https://map.naver.com/p/entry/place/123",
        missingFields: ["phone", "hours"],
      })
    }
  })
})
