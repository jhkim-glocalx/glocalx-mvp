import { z } from "zod"
import { describe, expect, it } from "vitest"

import { createIntegrationAdapters } from "./index"

const stubSearchResultSchema = z.object({
  candidates: z.array(
    z.object({
      name: z.string(),
    })
  ),
})

describe("adapter-selection", () => {
  it("selects stub adapters by default", async () => {
    const adapters = createIntegrationAdapters({ env: {} })
    const result = await adapters.naverSearch.searchLocal({
      query: "브런치모먼트",
      display: 5,
    })

    expect(adapters.mode).toBe("stub")
    expect(result.kind).toBe("ok")
    if (result.kind === "ok") {
      const stubSearchResult = stubSearchResultSchema.parse(result.value)
      expect(stubSearchResult.candidates[0]?.name).toBe("브런치모먼트 홍대점")
    }
  })

  it("uses stub Naver search on Vercel previews when production Naver credentials are missing", async () => {
    const adapters = createIntegrationAdapters({
      env: {
        APP_INTEGRATION_MODE: "production",
        VERCEL_ENV: "preview",
      },
    })

    const result = await adapters.naverSearch.searchLocal({
      query: "브런치모먼트",
      display: 5,
    })

    expect(adapters.mode).toBe("production")
    expect(result.kind).toBe("ok")
    if (result.kind === "ok") {
      const stubSearchResult = stubSearchResultSchema.parse(result.value)
      expect(stubSearchResult.candidates[0]?.name).toBe("브런치모먼트 홍대점")
    }
  })
})
