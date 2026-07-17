import { describe, expect, it } from "vitest"

import { resolveDatabaseConfig } from "./config.ts"

describe("Neon database configuration aliases", () => {
  it("accepts DATABASE_URL_UNPOOLED as the production-like direct URL", () => {
    // Given: Vercel Neon injects the pooled URL and its unpooled direct URL.
    const env = {
      DATABASE_PROVIDER: "postgres",
      DATABASE_URL: "postgres://app:secret@localhost:5432/glocalx",
      DATABASE_URL_DIRECT: "",
      DATABASE_URL_UNPOOLED: "postgres://admin:secret@localhost:5432/glocalx",
      VERCEL: "1",
    }

    // When: the environment boundary is parsed.
    const config = resolveDatabaseConfig(env)

    // Then: production-like runtime accepts the Neon direct URL alias.
    expect(config).toEqual({
      poolMax: 5,
      provider: "postgres",
      runtimeUrl: "postgres://app:secret@localhost:5432/glocalx",
    })
  })
})
