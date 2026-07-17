import type { PostgresClient } from "./connection.ts"
import { migratePostgresDatabase, resetPostgresDatabase } from "./migrations.ts"
import type { ExportSnapshot, MigrationRow } from "../sqlite-to-postgres.ts"
import {
  MigrationInputError,
  normalizeRow,
  tableSpecFor,
} from "../sqlite-to-postgres.ts"
import type { TableReconciliation } from "../sqlite-to-postgres-reconcile.ts"
import { reconcileSnapshots } from "../sqlite-to-postgres-reconcile.ts"

export type ImportOptions = {
  readonly resetTarget: boolean
}

export class MigrationSafetyError extends Error {
  readonly name = "MigrationSafetyError"
}

type PostgresParameter = boolean | number | string | null
export type UnsafeSqlExecutor = {
  readonly unsafe: (
    query: string,
    parameters?: PostgresParameter[]
  ) => PromiseLike<unknown>
}

export function assertSafePostgresImportTarget(
  env: Readonly<Record<string, string | undefined>>,
  databaseUrl: string,
  confirmedNonProduction: boolean
): void {
  if (!confirmedNonProduction) {
    throw new MigrationSafetyError(
      "Pass --confirm-non-production before writing to Postgres"
    )
  }
  if (env["VERCEL_ENV"] === "production" || env["NODE_ENV"] === "production") {
    throw new MigrationSafetyError(
      "Refusing to import while production env is active"
    )
  }
  const parsedUrl = new URL(databaseUrl)
  const targetText = [
    parsedUrl.hostname,
    parsedUrl.pathname.replace("/", ""),
    parsedUrl.username,
  ]
    .join(" ")
    .toLowerCase()
  if (
    /\bprod(?:uction)?\b/.test(targetText) ||
    targetText.includes("glocalx-mvp-tawny")
  ) {
    throw new MigrationSafetyError(
      "Refusing to import to an obvious production target"
    )
  }
}

export function describePostgresTarget(databaseUrl: string): string {
  const parsedUrl = new URL(databaseUrl)
  const databaseName = parsedUrl.pathname.replace("/", "") || "(default)"
  return `${parsedUrl.hostname}/${databaseName}`
}

export async function importSnapshotToPostgres(
  sql: PostgresClient,
  snapshot: ExportSnapshot,
  options: ImportOptions
): Promise<readonly TableReconciliation[]> {
  if (options.resetTarget) {
    await resetPostgresDatabase(sql)
  } else {
    await migratePostgresDatabase(sql)
  }
  await sql.begin(async (transaction) => {
    await invalidatePostgresSessions(transaction)
    for (const table of snapshot.tables) {
      await importTable(transaction, table)
    }
    await updateDeferredColumns(transaction, snapshot)
  })
  const importedSnapshot = await collectPostgresSnapshot(sql, snapshot)
  return reconcileSnapshots(snapshot, importedSnapshot)
}

export async function invalidatePostgresSessions(
  sql: UnsafeSqlExecutor
): Promise<void> {
  await sql.unsafe("DELETE FROM user_sessions")
}

export async function collectPostgresSnapshot(
  sql: PostgresClient,
  sourceSnapshot: ExportSnapshot
): Promise<ExportSnapshot> {
  const tables = new Array<ExportSnapshot["tables"][number]>()
  for (const table of sourceSnapshot.tables) {
    const columnList = table.columns.map(quoteIdentifier).join(", ")
    const spec = tableSpecFor(table.name)
    const primaryKeyColumn = spec.primaryKeyColumn ?? "id"
    const rows = await sql.unsafe<Readonly<Record<string, unknown>>[]>(
      `SELECT ${columnList} FROM ${quoteIdentifier(table.name)} ORDER BY ${quoteIdentifier(primaryKeyColumn)}`
    )
    tables.push({
      columns: table.columns,
      name: table.name,
      rows: rows.map((row) => normalizeRow(spec, table.columns, row)),
    })
  }
  return {
    exportedAt: new Date().toISOString(),
    source: "sqlite",
    tables,
    version: 1,
  }
}

export async function importTable(
  sql: UnsafeSqlExecutor,
  table: ExportSnapshot["tables"][number]
): Promise<void> {
  const spec = tableSpecFor(table.name)
  const primaryKeyColumn = spec.primaryKeyColumn ?? "id"
  const deferredColumns = new Set(spec.deferredColumns ?? [])
  const insertColumns = table.columns.filter(
    (column) => !deferredColumns.has(column)
  )
  for (const row of table.rows) {
    const parameters = new Array<PostgresParameter>()
    const placeholders = insertColumns.map((column) => {
      parameters.push(toPostgresParameter(spec, column, row))
      return placeholder(parameters.length, spec, column)
    })
    const updateColumns = insertColumns.filter(
      (column) => column !== primaryKeyColumn
    )
    const updateSet = updateColumns
      .map(
        (column) =>
          `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`
      )
      .join(", ")
    await sql.unsafe(
      `INSERT INTO ${quoteIdentifier(table.name)} (${insertColumns
        .map(quoteIdentifier)
        .join(
          ", "
        )}) VALUES (${placeholders.join(", ")}) ON CONFLICT (${quoteIdentifier(primaryKeyColumn)}) DO UPDATE SET ${updateSet}`,
      parameters
    )
  }
}

async function updateDeferredColumns(
  sql: UnsafeSqlExecutor,
  snapshot: ExportSnapshot
): Promise<void> {
  for (const table of snapshot.tables) {
    const spec = tableSpecFor(table.name)
    const primaryKeyColumn = spec.primaryKeyColumn ?? "id"
    for (const column of spec.deferredColumns ?? []) {
      for (const row of table.rows) {
        const primaryKey = row[primaryKeyColumn]
        if (typeof primaryKey !== "string") {
          throw new MigrationInputError(
            `${table.name}.${primaryKeyColumn} must be a string`
          )
        }
        await sql.unsafe(
          `UPDATE ${quoteIdentifier(table.name)} SET ${quoteIdentifier(column)} = $1 WHERE ${quoteIdentifier(primaryKeyColumn)} = $2`,
          [toPostgresParameter(spec, column, row), primaryKey]
        )
      }
    }
  }
}

function toPostgresParameter(
  spec: ReturnType<typeof tableSpecFor>,
  column: string,
  row: MigrationRow
): PostgresParameter {
  const value = row[column]
  const isNullableJsonColumn =
    spec.nullableJsonColumns?.includes(column) === true
  if (value === undefined) {
    if (isNullableJsonColumn) {
      return null
    }
    throw new MigrationInputError(`Missing exported column ${column}`)
  }
  if (spec.jsonColumns.includes(column)) {
    return value === null && isNullableJsonColumn ? null : JSON.stringify(value)
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }
  throw new MigrationInputError(`${column} must be scalar for Postgres import`)
}

function placeholder(
  index: number,
  spec: ReturnType<typeof tableSpecFor>,
  column: string
): string {
  if (spec.jsonColumns.includes(column)) {
    return `$${index}::jsonb`
  }
  if (column.endsWith("_at") || column === "run_after") {
    return `$${index}::timestamptz`
  }
  return `$${index}`
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}
