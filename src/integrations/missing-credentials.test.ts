import { describe, expect, it } from "vitest"

import { createIntegrationAdapters } from "./index"

describe("missing-credentials", () => {
  it("reports missing Naver credentials without printing secret values", async () => {
    const adapters = createIntegrationAdapters({
      env: { APP_INTEGRATION_MODE: "production" },
    })

    const result = await adapters.naverSearch.searchLocal({
      query: "브런치모먼트",
      display: 5,
    })

    expect(result).toEqual({
      kind: "blocked_by_credentials",
      code: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: ["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"],
    })
  })

  it("reports missing Google credentials without printing secret values", () => {
    const adapters = createIntegrationAdapters({
      env: { APP_INTEGRATION_MODE: "production" },
    })

    const result = adapters.gbpLocalPosts.createLocalPost({
      accessToken: "",
      parent: "accounts/demo/locations/demo",
      summary: "주말 브런치 신메뉴",
    })

    expect(result).toEqual({
      kind: "blocked_by_credentials",
      code: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    })
  })

  it("reports missing OpenAI credentials for live marketing generation", async () => {
    const adapters = createIntegrationAdapters({
      env: { APP_INTEGRATION_MODE: "production" },
    })

    const result = await adapters.marketingGeneration.generateMarketingDraft({
      imageAssets: [],
      ownerIntent: "이번 주말 브런치 신메뉴 홍보",
      storeAddress: "서울 마포구 와우산로 123",
      storeName: "브런치모먼트 홍대점",
      suggestionMode: "request",
    })

    expect(result).toEqual({
      kind: "blocked_by_credentials",
      code: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: ["OPENAI_API_KEY"],
    })
  })
})
