import { afterEach, describe, expect, it, vi } from "vitest"

import {
  resetAndSeedDatabaseForProvider,
  runProviderAwareDatabaseCli,
} from "@glocalx/db/reset-seed"

afterEach(() => {
  process.exitCode = undefined
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

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

  it("blocks Postgres reset in production-like environments", async () => {
    const databaseUrl = "postgres://admin:secret@localhost:5432/glocalx"

    await expect(
      resetAndSeedDatabaseForProvider({
        DATABASE_PROVIDER: "postgres",
        DATABASE_URL: databaseUrl,
        DATABASE_URL_DIRECT: databaseUrl,
        VERCEL_ENV: "production",
      })
    ).rejects.toMatchObject({
      message: "Postgres reset is disabled in production-like environments.",
      name: "ProductionDatabaseResetError",
    })
  })

  it("reports a controlled provider reset error without a stack trace", async () => {
    const databaseUrl = "postgres://admin:secret@localhost:5432/glocalx"
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(
      runProviderAwareDatabaseCli(() =>
        resetAndSeedDatabaseForProvider({
          DATABASE_PROVIDER: "postgres",
          DATABASE_URL: databaseUrl,
          DATABASE_URL_DIRECT: databaseUrl,
        })
      )
    ).resolves.toBeUndefined()

    expect(consoleError).toHaveBeenCalledWith(
      "ProductionDatabaseResetError: Postgres reset requires POSTGRES_RESET_TARGET=localhost:5432/glocalx."
    )
    expect(process.exitCode).toBe(1)
  })
})
