import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  DatabaseConfigurationError,
  openDatabaseContext,
  resolveDatabaseConfig,
} from "@/server/db"
import {
  buildPostgresRuntimeOptions,
  openPostgresDatabaseContext,
} from "@/server/db/postgres/runtime-client.ts"
import { hasConfiguredPostgresDirectUrl } from "@/server/db/postgres/direct-url.ts"

const tempDirectories: string[] = []

function createTempDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "glocalx-db-boundary-"))
  tempDirectories.push(directory)
  return join(directory, "test.db")
}

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("database client boundary", () => {
  it("resolves an async SQLite queryable when the provider is defaulted", async () => {
    // Given: no provider override and an isolated database path.
    vi.stubEnv("DATABASE_PROVIDER", "")
    vi.stubEnv("GLOCALX_DB_PATH", createTempDatabasePath())

    // When: a request-scoped database context is opened.
    const context = await openDatabaseContext()

    try {
      await context.queryable.execute(
        "CREATE TABLE boundary_probe (id INTEGER PRIMARY KEY, label TEXT NOT NULL)"
      )
      await context.queryable.execute(
        "INSERT INTO boundary_probe (label) VALUES (?)",
        ["ready"]
      )
      const row = await context.queryable.queryOne(
        "SELECT label FROM boundary_probe WHERE id = ?",
        [1]
      )

      // Then: the neutral queryable returns SQLite data through async methods.
      expect(row).toEqual({ label: "ready" })
    } finally {
      await context.close()
    }
  })

  it("throws a typed configuration error when the provider is invalid", async () => {
    // Given: a malformed provider value from the environment boundary.
    vi.stubEnv("DATABASE_PROVIDER", "mysql")
    vi.stubEnv("GLOCALX_DB_PATH", createTempDatabasePath())

    // When / Then: opening the context fails with a controlled typed error.
    await expect(openDatabaseContext()).rejects.toBeInstanceOf(
      DatabaseConfigurationError
    )
  })

  it("resolves Postgres runtime configuration when the provider is postgres", () => {
    // Given: runtime Postgres mode is selected with a pooled application URL.
    vi.stubEnv("DATABASE_PROVIDER", "postgres")
    vi.stubEnv("DATABASE_URL", "postgres://app:secret@localhost:5432/glocalx")
    vi.stubEnv(
      "DATABASE_URL_DIRECT",
      "postgres://admin:secret@localhost:5432/glocalx"
    )
    vi.stubEnv("DATABASE_POOL_MAX", "")

    // When: the environment boundary is parsed.
    const config = resolveDatabaseConfig()

    // Then: runtime mode uses the pooled DATABASE_URL and the default pool max.
    expect(config).toEqual({
      poolMax: 5,
      provider: "postgres",
      runtimeUrl: "postgres://app:secret@localhost:5432/glocalx",
    })
  })

  it("requires Postgres URLs instead of defaulting to SQLite in Vercel production", () => {
    // Given: a production-like Vercel runtime without database configuration.
    vi.stubEnv("VERCEL", "1")
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("DATABASE_PROVIDER", "")
    vi.stubEnv("DATABASE_URL", "")
    vi.stubEnv("DATABASE_URL_DIRECT", "")
    vi.stubEnv("DATABASE_URL_UNPOOLED", "")
    vi.stubEnv("POSTGRES_URL_NON_POOLING", "")

    // When / Then: the environment boundary rejects the missing pooled URL first.
    expect(() => resolveDatabaseConfig()).toThrow(
      expect.objectContaining({
        code: "DATABASE_URL_REQUIRED",
        name: "DatabaseConfigurationError",
      })
    )
  })

  it("rejects explicit SQLite in production-like deployments", () => {
    // Given: a preview deployment explicitly selects the local-only provider.
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("DATABASE_PROVIDER", "sqlite")

    // When / Then: the environment boundary rejects SQLite before opening it.
    expect(() => resolveDatabaseConfig()).toThrow(
      expect.objectContaining({
        code: "DATABASE_PROVIDER_UNSUPPORTED",
        name: "DatabaseConfigurationError",
        provider: "sqlite",
      })
    )
  })

  it("requires a direct Postgres URL in production-like deployments", () => {
    // Given: production-like Postgres mode has the pooled runtime URL only.
    vi.stubEnv("VERCEL", "1")
    vi.stubEnv("DATABASE_PROVIDER", "postgres")
    vi.stubEnv("DATABASE_URL", "postgres://app:secret@localhost:5432/glocalx")
    vi.stubEnv("DATABASE_URL_DIRECT", "")
    vi.stubEnv("DATABASE_URL_UNPOOLED", "")
    vi.stubEnv("POSTGRES_URL_NON_POOLING", "")

    // When / Then: the release-safety direct URL requirement is enforced.
    expect(() => resolveDatabaseConfig()).toThrow(
      expect.objectContaining({
        code: "DATABASE_URL_DIRECT_REQUIRED",
        name: "DatabaseConfigurationError",
      })
    )
  })

  it("resolves pooled runtime URL when production-like Postgres config is complete", () => {
    // Given: production-like Postgres mode has both required URL roles.
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("DATABASE_PROVIDER", "postgres")
    vi.stubEnv("DATABASE_URL", "postgres://app:secret@localhost:5432/glocalx")
    vi.stubEnv(
      "DATABASE_URL_DIRECT",
      "postgres://admin:secret@localhost:5432/glocalx"
    )

    // When: the environment boundary is parsed.
    const config = resolveDatabaseConfig()

    // Then: app traffic still uses the pooled runtime URL.
    expect(config).toEqual({
      poolMax: 5,
      provider: "postgres",
      runtimeUrl: "postgres://app:secret@localhost:5432/glocalx",
    })
  })

  it("throws DATABASE_URL_REQUIRED when Postgres runtime URL is missing", async () => {
    // Given: Postgres mode is selected without a pooled runtime URL.
    vi.stubEnv("DATABASE_PROVIDER", "postgres")
    vi.stubEnv("DATABASE_URL", "")
    vi.stubEnv(
      "DATABASE_URL_DIRECT",
      "postgres://admin:secret@localhost:5432/glocalx"
    )

    // When / Then: opening the context fails with a typed configuration code.
    await expect(openDatabaseContext()).rejects.toMatchObject({
      code: "DATABASE_URL_REQUIRED",
      name: "DatabaseConfigurationError",
    })
  })

  it("throws DATABASE_POOL_MAX_INVALID when Postgres pool max is not positive", async () => {
    // Given: Postgres mode is selected with an invalid pool size.
    vi.stubEnv("DATABASE_PROVIDER", "postgres")
    vi.stubEnv("DATABASE_URL", "postgres://app:secret@localhost:5432/glocalx")
    vi.stubEnv("DATABASE_POOL_MAX", "0")

    // When / Then: the environment boundary rejects the malformed pool size.
    await expect(openDatabaseContext()).rejects.toMatchObject({
      code: "DATABASE_POOL_MAX_INVALID",
      name: "DatabaseConfigurationError",
    })
  })

  it("builds pooled Postgres runtime options without session prepared statements", () => {
    // Given: a cloud-like managed database URL and an explicit pool size.
    const runtimeUrl = "postgres://app:secret@db.example.com:5432/glocalx"

    // When: runtime client options are constructed.
    const options = buildPostgresRuntimeOptions({
      poolMax: 7,
      runtimeUrl,
    })

    // Then: app runtime pooling is bounded, SSL is required, and prepared mode is disabled.
    expect(options).toMatchObject({
      connection: {
        statement_timeout: 30_000,
      },
      connect_timeout: 5,
      idle_timeout: 30,
      max: 7,
      prepare: false,
      ssl: "require",
    })
  })

  it("keeps local Postgres runtime options usable without SSL", () => {
    // Given: a local Docker-style runtime URL.
    const runtimeUrl = "postgres://app:secret@127.0.0.1:5432/glocalx"

    // When: runtime client options are constructed.
    const options = buildPostgresRuntimeOptions({
      poolMax: 5,
      runtimeUrl,
    })

    // Then: localhost development does not require TLS.
    expect(options.ssl).toBe(false)
  })

  it("runs a transaction and releases request resources on close", async () => {
    // Given: a request-scoped SQLite context.
    vi.stubEnv("DATABASE_PROVIDER", "sqlite")
    vi.stubEnv("GLOCALX_DB_PATH", createTempDatabasePath())
    const context = await openDatabaseContext()

    await context.queryable.execute(
      "CREATE TABLE transaction_probe (id INTEGER PRIMARY KEY, label TEXT NOT NULL)"
    )

    try {
      // When: multiple writes run inside the neutral transaction boundary.
      await context.queryable.transaction(async (transaction) => {
        await transaction.execute(
          "INSERT INTO transaction_probe (label) VALUES (?)",
          ["first"]
        )
        await transaction.execute(
          "INSERT INTO transaction_probe (label) VALUES (?)",
          ["second"]
        )
      })

      const rows = await context.queryable.query(
        "SELECT label FROM transaction_probe ORDER BY id"
      )

      // Then: committed rows are visible through the same queryable.
      expect(rows).toEqual([{ label: "first" }, { label: "second" }])
    } finally {
      await context.close()
    }

    // Then: the closed request context releases its underlying resource.
    await expect(
      context.queryable.query("SELECT label FROM transaction_probe")
    ).rejects.toThrow()
  })

  it("runs Postgres-mode queryable checks when local Postgres env is configured", async () => {
    // Given: live Postgres integration is intentionally gated by both URLs.
    const missingEnvNames = [
      ...(!process.env["DATABASE_URL"] ? ["DATABASE_URL"] : []),
      ...(hasConfiguredPostgresDirectUrl(process.env)
        ? []
        : [
            "DATABASE_URL_DIRECT or DATABASE_URL_UNPOOLED or POSTGRES_URL_NON_POOLING",
          ]),
    ]
    if (missingEnvNames.length > 0) {
      console.info(`BLOCKED_BY_ENV missing ${missingEnvNames.join(",")}`)
      return
    }

    vi.stubEnv("DATABASE_PROVIDER", "postgres")

    // When: the runtime Postgres queryable writes and reads through the DB boundary.
    const config = resolveDatabaseConfig()
    if (config.provider === "sqlite") {
      throw new DatabaseConfigurationError({
        code: "DATABASE_PROVIDER_UNSUPPORTED",
        message: "Expected Postgres provider for live runtime test",
        provider: config.provider,
      })
    }

    const context = await openPostgresDatabaseContext(config)
    try {
      await context.queryable.execute(
        "CREATE TABLE IF NOT EXISTS glocalx_runtime_client_probe (label text PRIMARY KEY)"
      )
      await context.queryable.transaction(async (transaction) => {
        await transaction.execute(
          "INSERT INTO glocalx_runtime_client_probe (label) VALUES ($1) ON CONFLICT (label) DO NOTHING",
          ["ready"]
        )
      })
      const row = await context.queryable.queryOne(
        "SELECT label FROM glocalx_runtime_client_probe WHERE label = $1",
        ["ready"]
      )

      // Then: the runtime Postgres adapter returns rows through the neutral queryable.
      expect(row).toEqual({ label: "ready" })
    } finally {
      await context.close()
    }
  })
})
