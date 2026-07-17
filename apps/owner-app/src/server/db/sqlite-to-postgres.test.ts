import { mkdtempSync, readFileSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import Database from "better-sqlite3"
import { describe, expect, it } from "vitest"

import { applyMigrations, seedDemoData } from "./sqlite.ts"
import {
  importTable,
  invalidatePostgresSessions,
} from "./postgres/sqlite-import.ts"
import type { ExportSnapshot } from "./sqlite-to-postgres.ts"
import {
  MigrationInputError,
  collectSqliteExportSnapshot,
  readExportSnapshot,
  sqliteToPostgresTableSpecs,
  writeExportSnapshot,
} from "./sqlite-to-postgres.ts"
import {
  MigrationReconciliationError,
  reconcileSnapshots,
  summarizeSnapshot,
} from "./sqlite-to-postgres-reconcile.ts"

function seededSnapshot(): ExportSnapshot {
  const database = new Database(":memory:")
  try {
    database.pragma("foreign_keys = ON")
    applyMigrations(database)
    seedDemoData(database)
    return collectSqliteExportSnapshot(database)
  } finally {
    database.close()
  }
}

function seededSnapshotWithSession(): ExportSnapshot {
  const database = new Database(":memory:")
  try {
    database.pragma("foreign_keys = ON")
    applyMigrations(database)
    seedDemoData(database)
    database
      .prepare(
        "INSERT INTO user_sessions (id, user_id, store_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(
        "session-1",
        "demo-owner",
        "demo-store",
        "2026-06-11T00:00:00.000Z",
        "2026-06-04T00:00:00.000Z"
      )
    return collectSqliteExportSnapshot(database)
  } finally {
    database.close()
  }
}

function tableNames(snapshot: ExportSnapshot): readonly string[] {
  return snapshot.tables.map((table) => table.name)
}

function removeFirstUser(snapshot: ExportSnapshot): ExportSnapshot {
  return {
    ...snapshot,
    tables: snapshot.tables.map((table) =>
      table.name === "users" ? { ...table, rows: table.rows.slice(1) } : table
    ),
  }
}

type CapturingSql = {
  readonly capturedParameters: readonly (readonly unknown[])[]
  readonly capturedQueries: readonly string[]
  readonly executor: Parameters<typeof importTable>[0]
}

function capturingSql(): CapturingSql {
  const capturedParameters: unknown[][] = []
  const capturedQueries: string[] = []
  return {
    capturedParameters,
    capturedQueries,
    executor: {
      unsafe: async (query, parameters) => {
        capturedQueries.push(query)
        capturedParameters.push([...(parameters ?? [])])
      },
    },
  }
}

describe("SQLite to Postgres migration export", () => {
  it("exports seeded SQLite rows with required tables and Postgres-safe values", () => {
    // Given: a migrated SQLite database with deterministic demo data.
    const snapshot = seededSnapshot()

    // When: the export snapshot is summarized for reconciliation.
    const summary = summarizeSnapshot(snapshot)
    const authIdentity = snapshot.tables
      .find((table) => table.name === "auth_identities")
      ?.rows.at(0)

    // Then: every durable table is covered and transformed values are typed.
    const exportedTableNames = sqliteToPostgresTableSpecs.map(
      (spec) => spec.name
    )
    expect(tableNames(snapshot)).toEqual(exportedTableNames)
    expect(sqliteToPostgresTableSpecs.map((spec) => spec.name)).toEqual([
      ...exportedTableNames,
    ])
    expect(summary).toHaveLength(exportedTableNames.length)
    expect(authIdentity?.["created_at"]).toBe("2026-06-04T00:00:00.000Z")
    expect(authIdentity?.["scopes_json"]).toEqual([
      "openid",
      "email",
      "profile",
    ])
  })

  it("round-trips export JSON and reconciles counts plus checksums", () => {
    // Given: a seeded SQLite export written to disk.
    const snapshot = seededSnapshot()
    const exportPath = join(
      mkdtempSync(join(tmpdir(), "glocalx-export-")),
      "export.json"
    )

    // When: the export is read back through the JSON boundary.
    writeExportSnapshot(exportPath, snapshot)
    const roundTripSnapshot = readExportSnapshot(exportPath)
    const report = reconcileSnapshots(snapshot, roundTripSnapshot)
    const storedExport = readFileSync(exportPath, "utf8")

    // Then: reconciliation succeeds without exposing credentials on disk.
    expect(report.map((table) => table.name)).toEqual(
      sqliteToPostgresTableSpecs.map((spec) => spec.name)
    )
    expect(storedExport).not.toContain("password_hash")
    expect(storedExport).not.toContain("scrypt$")
    expect(statSync(exportPath).mode & 0o777).toBe(0o600)
  })

  it("rejects an encrypted export that omits migration tables", () => {
    // Given: an export snapshot that only includes one migration table.
    const exportPath = join(
      mkdtempSync(join(tmpdir(), "glocalx-export-")),
      "export.json"
    )
    const incompleteSnapshot: ExportSnapshot = {
      exportedAt: "2026-06-04T00:00:00.000Z",
      source: "sqlite",
      tables: [{ columns: ["id"], name: "users", rows: [{ id: "demo" }] }],
      version: 1,
    }

    // When: the encrypted export is read through the migration boundary.
    writeExportSnapshot(exportPath, incompleteSnapshot)

    // Then: the boundary rejects missing migration tables.
    expect(() => readExportSnapshot(exportPath)).toThrow(MigrationInputError)
  })

  it("fails reconciliation when an exported row is removed", () => {
    // Given: a seeded export and a target snapshot missing one user row.
    const snapshot = seededSnapshot()
    const targetSnapshot = removeFirstUser(snapshot)

    // When / Then: count and checksum reconciliation rejects the target.
    expect(() => reconcileSnapshots(snapshot, targetSnapshot)).toThrow(
      MigrationReconciliationError
    )
  })

  it("binds SQL NULL when nullable JSON export value is null", async () => {
    // Given: an exported nullable JSON value from SQLite.
    const sql = capturingSql()

    // When: the row is imported through the Postgres insert path.
    await importTable(sql.executor, {
      columns: ["id", "marketing_preview_json"],
      name: "post_drafts",
      rows: [{ id: "draft_with_null_preview", marketing_preview_json: null }],
    })

    // Then: Postgres receives SQL NULL instead of the JSONB string "null".
    expect(sql.capturedParameters).toEqual([["draft_with_null_preview", null]])
  })

  it("binds SQL NULL when nullable JSON export value is undefined", async () => {
    // Given: an exported row where SQLite omitted a nullable JSON field.
    const sql = capturingSql()

    // When: the row is imported through the Postgres insert path.
    await importTable(sql.executor, {
      columns: ["id", "marketing_preview_json"],
      name: "post_drafts",
      rows: [{ id: "draft_without_preview" }],
    })

    // Then: Postgres receives SQL NULL for the nullable JSON column.
    expect(sql.capturedParameters).toEqual([["draft_without_preview", null]])
  })

  it("uses the email credential primary key for conflict handling", async () => {
    const sql = capturingSql()

    await importTable(sql.executor, {
      columns: ["user_id", "password_hash", "created_at", "updated_at"],
      name: "email_credentials",
      rows: [
        {
          created_at: "2026-06-04T00:00:00.000Z",
          password_hash: "scrypt$fixture",
          updated_at: "2026-06-04T00:00:00.000Z",
          user_id: "owner-1",
        },
      ],
    })

    expect(sql.capturedQueries).toEqual([
      expect.stringContaining('ON CONFLICT ("user_id") DO UPDATE SET'),
    ])
  })

  it("invalidates target sessions before importing account state", async () => {
    // Given: a Postgres migration executor with potentially active sessions.
    const sql = capturingSql()

    // When: the import boundary invalidates authentication state.
    await invalidatePostgresSessions(sql.executor)

    // Then: every existing target session is deleted.
    expect(sql.capturedQueries).toEqual(["DELETE FROM user_sessions"])
  })

  it("excludes active sessions from migration snapshots", () => {
    // Given: a source database containing a reusable authenticated session.
    const snapshot = seededSnapshotWithSession()

    // When: the migration snapshot is collected.
    const exportedTableNames = tableNames(snapshot)

    // Then: bearer sessions are invalidated instead of serialized.
    expect(exportedTableNames).not.toContain("user_sessions")
  })
})
