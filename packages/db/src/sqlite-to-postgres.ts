import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

import { z } from "zod"

import { requiredTableNames } from "./sqlite.ts"
import type { RequiredTableName, SqliteDatabase } from "./sqlite.ts"
import { MigrationInputError } from "./sqlite-to-postgres-errors.ts"
import {
  decryptSqliteExport,
  encryptSqliteExport,
} from "./sqlite-export-encryption.ts"
import type { ColumnKind, TableSpec } from "./sqlite-to-postgres-spec.ts"
import { sqliteToPostgresTableSpecs } from "./sqlite-to-postgres-spec.ts"

export { MigrationInputError } from "./sqlite-to-postgres-errors.ts"
export {
  sqliteToPostgresTableSpecs,
  tableSpecFor,
} from "./sqlite-to-postgres-spec.ts"

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

export type MigrationRow = Readonly<Record<string, JsonValue>>

export type TableExport = {
  readonly columns: readonly string[]
  readonly name: RequiredTableName
  readonly rows: readonly MigrationRow[]
}

export type ExportSnapshot = {
  readonly exportedAt: string
  readonly source: "sqlite"
  readonly tables: readonly TableExport[]
  readonly version: 1
}

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
)

const rawRowSchema = z.record(z.string(), z.unknown())
const tableExportSchema: z.ZodType<TableExport> = z.object({
  columns: z.array(z.string()),
  name: z.enum(requiredTableNames),
  rows: z.array(z.record(z.string(), jsonValueSchema)),
})
const exportSnapshotSchema: z.ZodType<ExportSnapshot> = z.object({
  exportedAt: z.string(),
  source: z.literal("sqlite"),
  tables: z.array(tableExportSchema),
  version: z.literal(1),
})

export function columnKind(spec: TableSpec, column: string): ColumnKind {
  if (spec.jsonColumns.includes(column)) {
    return "json"
  }
  if (column.endsWith("_at") || column === "run_after") {
    return "date"
  }
  return "scalar"
}

export function normalizeColumnValue(
  spec: TableSpec,
  column: string,
  value: unknown
): JsonValue {
  if (value === null) {
    return null
  }
  switch (columnKind(spec, column)) {
    case "date":
      return normalizeDate(column, value)
    case "json":
      return normalizeJson(column, value)
    case "scalar":
      return normalizeScalar(column, value)
  }
}

export function collectSqliteExportSnapshot(
  database: SqliteDatabase
): ExportSnapshot {
  return {
    exportedAt: new Date().toISOString(),
    source: "sqlite",
    tables: sqliteToPostgresTableSpecs.map((spec) =>
      collectSqliteTable(database, spec)
    ),
    version: 1,
  }
}

export function readExportSnapshot(path: string): ExportSnapshot {
  try {
    const parsedJson: unknown = JSON.parse(
      decryptSqliteExport(readFileSync(path, "utf8"))
    )
    const snapshot = exportSnapshotSchema.parse(parsedJson)
    assertRequiredSnapshotTables(snapshot)
    return snapshot
  } catch (error) {
    if (error instanceof MigrationInputError) {
      throw error
    }
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      throw new MigrationInputError(
        `Invalid SQLite export JSON: ${error.message}`
      )
    }
    throw error
  }
}

export function writeExportSnapshot(
  path: string,
  snapshot: ExportSnapshot
): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${encryptSqliteExport(JSON.stringify(snapshot))}\n`, {
    encoding: "utf8",
    mode: 0o600,
  })
  chmodSync(path, 0o600)
}

function collectSqliteTable(
  database: SqliteDatabase,
  spec: TableSpec
): TableExport {
  const columns = z
    .array(z.object({ name: z.string() }))
    .parse(database.prepare(`PRAGMA table_info(${spec.name})`).all())
    .map((row) => row.name)
  const rows = z
    .array(rawRowSchema)
    .parse(
      database
        .prepare(
          `SELECT * FROM ${spec.name} ORDER BY ${spec.orderByColumn ?? "id"}`
        )
        .all()
    )
    .map((row) => normalizeRow(spec, columns, row))
  return { columns, name: spec.name, rows }
}

function assertRequiredSnapshotTables(snapshot: ExportSnapshot): void {
  const names = snapshot.tables.map((table) => table.name)
  const nameSet = new Set(names)
  const expectedNames = sqliteToPostgresTableSpecs.map((spec) => spec.name)
  const expectedNameSet = new Set<RequiredTableName>(expectedNames)
  const missing = expectedNames.filter((tableName) => !nameSet.has(tableName))
  const unexpected = names.filter((name) => !expectedNameSet.has(name))
  const duplicates = names.filter(
    (name, index) => names.indexOf(name) !== index
  )
  if (missing.length > 0 || unexpected.length > 0 || duplicates.length > 0) {
    throw new MigrationInputError(
      `SQLite export must contain every migration table once; missing=${missing.join(",")}; unexpected=${unexpected.join(",")}; duplicates=${duplicates.join(",")}`
    )
  }
}

export function normalizeRow(
  spec: TableSpec,
  columns: readonly string[],
  row: Readonly<Record<string, unknown>>
): MigrationRow {
  const normalized: Record<string, JsonValue> = {}
  for (const column of columns) {
    normalized[column] = normalizeColumnValue(spec, column, row[column])
  }
  return normalized
}

function normalizeDate(column: string, value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value !== "string") {
    throw new MigrationInputError(`${column} must be a date string`)
  }
  const trimmed = value.trim()
  const dateInput = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T00:00:00.000Z`
    : /(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed)
      ? trimmed
      : `${trimmed.replace(" ", "T")}Z`
  const parsed = new Date(dateInput)
  if (Number.isNaN(parsed.getTime())) {
    throw new MigrationInputError(
      `${column} must be ISO/timestamptz-compatible`
    )
  }
  return parsed.toISOString()
}

function normalizeJson(column: string, value: unknown): JsonValue {
  if (typeof value === "string") {
    const parsedJson: unknown = JSON.parse(value)
    return jsonValueSchema.parse(parsedJson)
  }
  return jsonValueSchema.parse(value)
}

function normalizeScalar(column: string, value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }
  throw new MigrationInputError(
    `${column} contains an unsupported SQLite value`
  )
}
