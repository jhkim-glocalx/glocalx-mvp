import { describe, expect, it } from "vitest"

import { databaseTableNames } from "../sqlite.ts"
import { PostgresSchemaVerificationError } from "./errors.ts"
import { loadPostgresMigrations } from "./schema-source.ts"
import { verifyPostgresDatabase } from "./runner.ts"
import type { PostgresClient } from "./connection.ts"

type FakeRow = Record<string, unknown>

// A minimal stand-in for postgres.js's tagged-template client: verifyPostgresDatabase
// issues exactly two `sql<T[]>` queries (table names, then applied migrations), in
// that order, so the fake just replays canned rows for each call in sequence.
function fakeSql(responses: readonly FakeRow[][]): PostgresClient {
  let callIndex = 0
  const tag = async (): Promise<FakeRow[]> => {
    const response = responses[callIndex]
    callIndex += 1
    return response ?? []
  }
  return tag as unknown as PostgresClient
}

const tableRows: FakeRow[] = [
  ...databaseTableNames,
  "glocalx_schema_migrations",
].map((name) => ({ name }))

describe("verifyPostgresDatabase", () => {
  it("passes when every migration is applied with a matching checksum", async () => {
    // Given: every table exists and every migration is recorded with its real checksum.
    const appliedRows = loadPostgresMigrations().map((migration) => ({
      version: migration.version,
      checksum: migration.checksum,
    }))
    const sql = fakeSql([tableRows, appliedRows])

    // When / Then: verification passes.
    await expect(verifyPostgresDatabase(sql)).resolves.toBeUndefined()
  })

  it("fails when a migration shipped in code was never applied", async () => {
    // Given: the most recent migration is missing from glocalx_schema_migrations —
    // the exact shape of the incident that motivated this check (migration 0020
    // shipped in code, was never run against prod, and only table-existence was
    // checked, so verify passed while the CHECK constraint was still stale).
    const migrations = loadPostgresMigrations()
    const appliedRows = migrations.slice(0, -1).map((migration) => ({
      version: migration.version,
      checksum: migration.checksum,
    }))
    const sql = fakeSql([tableRows, appliedRows])

    // When / Then: verification reports the unapplied migration by version.
    const lastMigration = migrations.at(-1)
    if (lastMigration === undefined) {
      throw new Error("Expected at least one Postgres migration.")
    }
    await expect(verifyPostgresDatabase(sql)).rejects.toThrow(
      expect.objectContaining({
        name: "PostgresSchemaVerificationError",
        message: expect.stringContaining(lastMigration.version),
      })
    )
  })

  it("fails when an applied migration's checksum no longer matches the source", async () => {
    // Given: a migration recorded as applied with a checksum that doesn't match
    // the current source file (the source changed after it was run).
    const migrations = loadPostgresMigrations()
    const appliedRows = migrations.map((migration, index) => ({
      version: migration.version,
      checksum: index === 0 ? "stale-checksum" : migration.checksum,
    }))
    const sql = fakeSql([tableRows, appliedRows])

    // When / Then: verification reports the checksum mismatch.
    await expect(verifyPostgresDatabase(sql)).rejects.toThrow(
      PostgresSchemaVerificationError
    )
  })

  it("fails when a required table is missing", async () => {
    // Given: one application table doesn't exist yet.
    const incompleteTableRows = tableRows.filter(
      (row) => row["name"] !== databaseTableNames[0]
    )
    const sql = fakeSql([incompleteTableRows, []])

    // When / Then: verification reports the missing table before checking migrations.
    await expect(verifyPostgresDatabase(sql)).rejects.toThrow(
      PostgresSchemaVerificationError
    )
  })
})
