import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { DatabaseConfigurationError, openDatabaseContext } from "@/server/db"

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
})
