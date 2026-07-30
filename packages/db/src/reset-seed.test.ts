import { existsSync, statSync, writeFileSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  resetAndSeedDatabaseForProvider,
  runProviderAwareDatabaseCli,
} from "@glocalx/db/reset-seed"
import { openDatabase, resetDatabaseFile } from "@glocalx/db/sqlite"

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

// The e2e harness resets between tests while the Next dev server holds the same
// SQLite file open. A reset that unlinks the file gives the two processes
// different inodes to lock, so both take the write lock and stomp on a shared
// journal path — which surfaced in CI as an intermittent `SqliteError: disk I/O
// error` (SQLITE_IOERR_DELETE_NOENT) from applyMigrations.
describe("sqlite reset with a concurrent connection open", () => {
  it("keeps an already-open connection writable across a reset", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "glocalx-reset-"))
    const databasePath = join(temporaryDirectory, "dev.db")
    const env = { GLOCALX_DB_PATH: databasePath }

    await resetAndSeedDatabaseForProvider(env)

    // Given: a second connection, standing in for the running dev server.
    const concurrent = openDatabase(databasePath)
    const inodeBefore = statSync(databasePath).ino

    try {
      concurrent.prepare("SELECT COUNT(*) AS count FROM stores").get()

      // When: the harness resets underneath it.
      await resetAndSeedDatabaseForProvider(env)

      // Then: the reset reused the file rather than replacing it, so the
      // connection's locking is still shared with the harness.
      expect(statSync(databasePath).ino).toBe(inodeBefore)

      // And: a write on that connection commits instead of failing on a
      // journal the harness has already deleted.
      expect(() => {
        concurrent.exec("BEGIN IMMEDIATE")
        concurrent
          .prepare("UPDATE stores SET name = ? WHERE id = 'demo-store'")
          .run("still writable")
        concurrent.exec("COMMIT")
      }).not.toThrow()

      // And: it observes the reseeded data, not a detached copy of the old file.
      const store = concurrent
        .prepare("SELECT name FROM stores WHERE id = 'demo-store'")
        .get() as { readonly name: string } | undefined
      expect(store?.name).toBe("still writable")
    } finally {
      concurrent.close()
      await rm(temporaryDirectory, { force: true, recursive: true })
    }
  })

  it("removes journal sidecars when the database file is reset outright", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "glocalx-reset-"))
    const databasePath = join(temporaryDirectory, "dev.db")

    await resetAndSeedDatabaseForProvider({ GLOCALX_DB_PATH: databasePath })
    // A journal stranded next to a recreated database reads as a hot journal
    // belonging to it, and SQLite tries to roll it back over the new file.
    writeFileSync(`${databasePath}-journal`, "stale")

    resetDatabaseFile(databasePath)

    expect(existsSync(databasePath)).toBe(false)
    expect(existsSync(`${databasePath}-journal`)).toBe(false)

    await rm(temporaryDirectory, { force: true, recursive: true })
  })
})

// The demo/staging seed (db:reset && db:seed) must write the full cohort — the
// unit-test fixture only writes the base happy-path store, so this is the one
// place that exercises the cohort tier end-to-end through the real seed path.
describe("reset and seed writes the full demo cohort", () => {
  async function withSeededDatabase(
    run: (database: ReturnType<typeof openDatabase>) => void
  ): Promise<void> {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "glocalx-cohort-"))
    const databasePath = join(temporaryDirectory, "dev.db")
    await resetAndSeedDatabaseForProvider({ GLOCALX_DB_PATH: databasePath })
    const database = openDatabase(databasePath)
    try {
      run(database)
    } finally {
      database.close()
      await rm(temporaryDirectory, { force: true, recursive: true })
    }
  }

  it("keeps the happy-path demo-store intact for the e2e/login flows", async () => {
    await withSeededDatabase((database) => {
      const store = database
        .prepare("SELECT onboarding_status FROM stores WHERE id = 'demo-store'")
        .get() as { readonly onboarding_status: string } | undefined
      expect(store?.onboarding_status).toBe("COMPLETED")

      const location = database
        .prepare(
          "SELECT status FROM gbp_locations WHERE id = 'demo-gbp-location'"
        )
        .get() as { readonly status: string } | undefined
      expect(location?.status).toBe("VERIFIED")

      // demo-store is still the oldest store so the owner-app "oldest store"
      // login resolves it rather than a cohort store.
      const oldest = database
        .prepare(
          "SELECT id FROM stores WHERE owner_user_id = 'demo-owner' ORDER BY created_at ASC LIMIT 1"
        )
        .get() as { readonly id: string } | undefined
      expect(oldest?.id).toBe("demo-store")
    })
  })

  it("populates every operator-visible pipeline state", async () => {
    await withSeededDatabase((database) => {
      const storeCount = database
        .prepare("SELECT COUNT(*) AS count FROM stores")
        .get() as { readonly count: number }
      expect(storeCount.count).toBe(7)

      const campaignStatuses = (
        database
          .prepare("SELECT DISTINCT status FROM campaign_requests")
          .all() as ReadonlyArray<{ readonly status: string }>
      ).map((row) => row.status)
      expect(new Set(campaignStatuses)).toEqual(
        new Set([
          "submitted",
          "in_production",
          "ready_for_review",
          "changes_requested",
          "partially_published",
          "published",
        ])
      )

      const accessStates = (
        database
          .prepare("SELECT DISTINCT state FROM gbp_access_requests")
          .all() as ReadonlyArray<{ readonly state: string }>
      ).map((row) => row.state)
      for (const state of ["invited", "pending", "granted", "blocked"]) {
        expect(accessStates).toContain(state)
      }

      const inboxModes = (
        database
          .prepare("SELECT DISTINCT mode FROM cs_conversations")
          .all() as ReadonlyArray<{ readonly mode: string }>
      ).map((row) => row.mode)
      expect(inboxModes).toContain("human")
      expect(inboxModes).toContain("ai_draft")
    })
  })

  it("leaves no orphaned campaign rows after seeding", async () => {
    await withSeededDatabase((database) => {
      const orphans = database
        .prepare(
          `SELECT COUNT(*) AS count FROM campaign_requests c
           LEFT JOIN stores s ON s.id = c.store_id
           WHERE s.id IS NULL`
        )
        .get() as { readonly count: number }
      expect(orphans.count).toBe(0)
    })
  })
})
