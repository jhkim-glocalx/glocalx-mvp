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

  it("freezes the stub clock on the fixture date so seeded data stays deterministic", () => {
    const adapters = createIntegrationAdapters({ env: {} })

    expect(adapters.clock.now().toISOString()).toBe("2026-06-04T00:00:00.000Z")
  })

  it("stamps real wall-clock time in production so owner writes are not dated to the fixture", () => {
    const before = Date.now()
    const adapters = createIntegrationAdapters({
      env: { APP_INTEGRATION_MODE: "production" },
    })
    const stamped = adapters.clock.now().getTime()

    expect(stamped).toBeGreaterThanOrEqual(before)
    expect(stamped).toBeLessThanOrEqual(Date.now())
  })

  it("lets an explicit now pin production time for deterministic tests", () => {
    const adapters = createIntegrationAdapters({
      env: { APP_INTEGRATION_MODE: "production" },
      now: new Date("2020-01-01T00:00:00.000Z"),
    })

    expect(adapters.clock.now().toISOString()).toBe("2020-01-01T00:00:00.000Z")
  })
})
