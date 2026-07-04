import { afterEach, describe, expect, it, vi } from "vitest"

import { requiredTableNames } from "../sqlite.ts"
import {
  DatabaseUrlDirectConfigurationError,
  collectCreateTableNames,
  loadPostgresMigrations,
  readDatabaseUrlDirect,
  verifyPostgresMigrationSource,
} from "./migrations.ts"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("Postgres migration tooling", () => {
  it("lists every durable table from the SQLite source of truth", () => {
    // Given: the Postgres migration source files.
    const migrationSql = loadPostgresMigrations()
      .map((migration) => migration.sql)
      .join("\n")

    // When: CREATE TABLE names are collected from the migration SQL.
    const tableNames = collectCreateTableNames(migrationSql)

    // Then: every durable table listed by the SQLite schema boundary exists.
    expect(tableNames).toEqual(expect.arrayContaining([...requiredTableNames]))
  })

  it("uses Postgres-native timestamp and JSON column types", () => {
    // Given: the Postgres migration source files.
    const migrationSql = loadPostgresMigrations()
      .map((migration) => migration.sql)
      .join("\n")

    // When / Then: date-like columns use timestamptz and JSON payloads use jsonb.
    expect(migrationSql).toContain("created_at timestamptz NOT NULL")
    expect(migrationSql).toContain("expires_at timestamptz")
    expect(migrationSql).toContain("scopes_json jsonb NOT NULL")
    expect(migrationSql).toContain("redacted_payload_json jsonb NOT NULL")
  })

  it("throws a controlled error when DATABASE_URL_DIRECT is missing", () => {
    // Given: no direct Postgres URL is configured.
    vi.stubEnv("DATABASE_URL_DIRECT", "")

    // When / Then: the environment boundary rejects the missing value.
    expect(() => readDatabaseUrlDirect()).toThrow(
      DatabaseUrlDirectConfigurationError
    )
  })

  it("throws a controlled error when DATABASE_URL_DIRECT is not Postgres", () => {
    // Given: a malformed direct URL for the Postgres tooling boundary.
    vi.stubEnv("DATABASE_URL_DIRECT", "sqlite://local.db")

    // When / Then: the environment boundary rejects non-Postgres URLs.
    expect(() => readDatabaseUrlDirect()).toThrow(
      DatabaseUrlDirectConfigurationError
    )
  })

  it("passes source verification for the current migration set", () => {
    // Given / When / Then: the source verifier accepts the checked-in SQL.
    expect(() => verifyPostgresMigrationSource()).not.toThrow()
  })
})
