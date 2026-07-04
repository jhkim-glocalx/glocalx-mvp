import { describe, expect, it, vi } from "vitest"

import { resetAndSeedDatabaseForProvider } from "@/server/db/reset-seed.ts"

describe("provider-aware reset and seed harness", () => {
  it("throws DATABASE_URL_REQUIRED before Postgres e2e reset opens a browser", async () => {
    // Given: Postgres e2e mode is selected without a pooled runtime URL.
    vi.stubEnv("DATABASE_PROVIDER", "postgres")
    vi.stubEnv("DATABASE_URL", "")
    vi.stubEnv(
      "DATABASE_URL_DIRECT",
      "postgres://admin:secret@localhost:5432/glocalx"
    )

    // When / Then: the harness fails at the typed environment boundary.
    await expect(resetAndSeedDatabaseForProvider()).rejects.toMatchObject({
      code: "DATABASE_URL_REQUIRED",
      name: "DatabaseConfigurationError",
    })
  })
})
