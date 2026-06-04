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
    source: "NAVER_LOCAL",
    name: "브런치모먼트 홍대점",
    address: "서울 마포구 와우산로 123",
    category: "브런치 카페",
    missingFields: ["phone", "hours"],
  },
  {
    source: "NAVER_LOCAL",
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
    searchLocal(): AdapterResult<NaverSearchResult | HttpRequestSpec> {
      return result
    },
  }
}

function timeoutNaverSearch(): NaverSearchAdapter {
  return {
    searchLocal(): AdapterResult<NaverSearchResult | HttpRequestSpec> {
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
    const result = extractBusinessProfile({
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

  it("returns manual recovery copy when Naver has no result", () => {
    // Given
    const adapters = createIntegrationAdapters({ env: {} })

    // When
    const result = extractBusinessProfile({
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

  it("requires explicit owner selection when Naver returns ambiguous matches", () => {
    // Given
    const adapters = {
      ...createIntegrationAdapters({ env: {} }),
      naverSearch: fakeNaverSearch({
        kind: "ok",
        value: { candidates: ambiguousCandidates },
      }),
    }

    // When
    const result = extractBusinessProfile({
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

  it("returns manual recovery copy when the Naver search times out", () => {
    // Given
    const adapters = {
      ...createIntegrationAdapters({ env: {} }),
      naverSearch: timeoutNaverSearch(),
    }

    // When
    const result = extractBusinessProfile({
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

  it("keeps the production Naver request headers at the adapter boundary", () => {
    // Given
    const adapters = createIntegrationAdapters({
      env: {
        APP_INTEGRATION_MODE: "production",
        NAVER_CLIENT_ID: "test-naver-client",
        NAVER_CLIENT_SECRET: "test-naver-secret",
      },
    })

    // When
    const result = extractBusinessProfile({
      adapters,
      input: "브런치모먼트",
      storeId: "demo-store",
    })

    // Then
    expect(result.status).toBe("NAVER_REQUEST_READY")
    if (result.status === "NAVER_REQUEST_READY") {
      expect(result.request).toEqual({
        method: "GET",
        url: "https://openapi.naver.com/v1/search/local.json?query=%EB%B8%8C%EB%9F%B0%EC%B9%98%EB%AA%A8%EB%A8%BC%ED%8A%B8&display=5&start=1&sort=random",
        headers: {
          "X-Naver-Client-Id": "test-naver-client",
          "X-Naver-Client-Secret": "test-naver-secret",
        },
      })
    }
  })
})
