import { afterEach, describe, expect, it, vi } from "vitest"

import { runPostgresCli } from "@/server/db/postgres/migrations.ts"
import {
  ProductionDatabaseResetError,
  assertPostgresResetAllowed,
} from "@/server/db/postgres/reset-guard.ts"

afterEach(() => {
  process.exitCode = undefined
  vi.restoreAllMocks()
})

describe("Postgres reset guard", () => {
  const databaseUrl =
    "postgres://admin:secret@ep-quiet-water-123456.us-east-2.aws.neon.tech/glocalx?sslmode=require"
  const target = "ep-quiet-water-123456.us-east-2.aws.neon.tech/glocalx"

  it("blocks an opaque remote target without target-bound confirmation", () => {
    // Given: a local shell points at a remote database without confirming it.
    const env = {}

    // When / Then: reset is rejected before a connection can be opened.
    expect(() => assertPostgresResetAllowed(env, databaseUrl)).toThrowError(
      expect.objectContaining({
        name: "ProductionDatabaseResetError",
      })
    )
  })

  it("blocks confirmation for a different target", () => {
    // Given: the operator confirmed a database other than the configured target.
    const env = { POSTGRES_RESET_TARGET: "localhost:5432/glocalx" }

    // When / Then: reset is rejected.
    expect(() => assertPostgresResetAllowed(env, databaseUrl)).toThrowError(
      expect.objectContaining({
        name: "ProductionDatabaseResetError",
      })
    )
  })

  it("blocks a URL without an explicit database name", () => {
    // Given: the driver could resolve the database from fallback environment variables.
    const hostOnlyUrl = "postgres://admin:secret@db.example/"
    const env = { POSTGRES_RESET_TARGET: "db.example/" }

    // When / Then: reset is rejected rather than confirming an ambiguous target.
    expect(() => assertPostgresResetAllowed(env, hostOnlyUrl)).toThrowError(
      "Postgres reset requires an explicit database name in the URL."
    )
  })

  it("blocks a URL whose hostname could fall back to PGHOST", () => {
    const hostlessUrl = "postgres:///glocalx"
    const env = {
      PGHOST: "production.example",
      POSTGRES_RESET_TARGET: "/glocalx",
    }

    expect(() => assertPostgresResetAllowed(env, hostlessUrl)).toThrowError(
      "Postgres reset requires an explicit hostname in the URL."
    )
  })

  it("allows an exact target confirmation in a local shell", () => {
    // Given: the operator confirmed the exact host and database.
    const env = { POSTGRES_RESET_TARGET: target }

    // When / Then: the guard accepts the reset target.
    expect(() => assertPostgresResetAllowed(env, databaseUrl)).not.toThrow()
  })

  it("blocks production-like environments even with exact confirmation", () => {
    // Given: an exact target is confirmed inside a Vercel environment.
    const env = { POSTGRES_RESET_TARGET: target, VERCEL: "1" }

    // When / Then: deployed environments cannot reset Postgres.
    expect(() => assertPostgresResetAllowed(env, databaseUrl)).toThrowError(
      "Postgres reset is disabled in production-like environments."
    )
  })

  it("reports a controlled CLI error without throwing a stack trace", async () => {
    // Given: the reset guard rejects an unsafe target.
    const error = new ProductionDatabaseResetError("Reset rejected.")
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    // When: the shared Postgres CLI boundary handles the rejection.
    await expect(
      runPostgresCli(async () => {
        throw error
      })
    ).resolves.toBeUndefined()

    // Then: the CLI reports one concise typed error and exits unsuccessfully.
    expect(consoleError).toHaveBeenCalledWith(
      "ProductionDatabaseResetError: Reset rejected."
    )
    expect(process.exitCode).toBe(1)
  })
})
