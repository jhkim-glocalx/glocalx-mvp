import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import Database from "better-sqlite3"
import { describe, expect, it } from "vitest"

import { applyMigrations, requiredTableNames, seedDemoData } from "./sqlite.ts"
import { importTable } from "./postgres/sqlite-import.ts"
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
  readonly executor: Parameters<typeof importTable>[0]
}

function capturingSql(): CapturingSql {
  const capturedParameters: unknown[][] = []
  return {
    capturedParameters,
    executor: {
      unsafe: async (_query, parameters) => {
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
    expect(tableNames(snapshot)).toEqual([...requiredTableNames])
    expect(sqliteToPostgresTableSpecs.map((spec) => spec.name)).toEqual([
      ...requiredTableNames,
    ])
    expect(summary).toHaveLength(requiredTableNames.length)
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

    // Then: reconciliation reports every durable table.
    expect(report.map((table) => table.name)).toEqual([...requiredTableNames])
  })

  it("rejects export JSON that omits durable tables", () => {
    // Given: an export file that only includes one durable table.
    const exportPath = join(
      mkdtempSync(join(tmpdir(), "glocalx-export-")),
      "export.json"
    )
    const incompleteSnapshot = {
      exportedAt: "2026-06-04T00:00:00.000Z",
      source: "sqlite",
      tables: [{ columns: ["id"], name: "users", rows: [{ id: "demo" }] }],
      version: 1,
    }

    // When: the export is read through the migration boundary.
    writeFileSync(exportPath, `${JSON.stringify(incompleteSnapshot)}\n`)

    // Then: the boundary rejects missing durable tables.
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
})
