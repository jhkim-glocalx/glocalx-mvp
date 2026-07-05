import { createHash } from "node:crypto"

import type {
  ExportSnapshot,
  JsonValue,
  MigrationRow,
} from "./sqlite-to-postgres.ts"
import { tableSpecFor } from "./sqlite-to-postgres.ts"
import type { RequiredTableName } from "./sqlite.ts"

export type TableReconciliation = {
  readonly checksum: string
  readonly idempotencyChecksum: string | null
  readonly name: RequiredTableName
  readonly rowCount: number
}

export class MigrationReconciliationError extends Error {
  readonly name = "MigrationReconciliationError"
}

export function summarizeSnapshot(
  snapshot: ExportSnapshot
): readonly TableReconciliation[] {
  return snapshot.tables.map((table) => summarizeTable(table))
}

export function reconcileSnapshots(
  expected: ExportSnapshot,
  actual: ExportSnapshot
): readonly TableReconciliation[] {
  const actualTables = new Map(
    actual.tables.map((table) => [table.name, table])
  )
  const mismatches = new Array<string>()
  const report = expected.tables.map((table) => {
    const actualTable = actualTables.get(table.name)
    if (actualTable === undefined) {
      mismatches.push(`${table.name}: missing target table`)
      return summarizeTable(table)
    }
    const expectedSummary = summarizeTable(table)
    const actualSummary = summarizeTable(actualTable)
    if (expectedSummary.rowCount !== actualSummary.rowCount) {
      mismatches.push(
        `${table.name}: count ${actualSummary.rowCount} != ${expectedSummary.rowCount}`
      )
    }
    if (expectedSummary.checksum !== actualSummary.checksum) {
      mismatches.push(`${table.name}: checksum mismatch`)
    }
    if (
      expectedSummary.idempotencyChecksum !== actualSummary.idempotencyChecksum
    ) {
      mismatches.push(`${table.name}: idempotency checksum mismatch`)
    }
    return expectedSummary
  })

  if (mismatches.length > 0) {
    throw new MigrationReconciliationError(
      `SQLite to Postgres reconciliation failed: ${mismatches.join("; ")}`
    )
  }
  return report
}

export function formatReconciliationSummary(
  report: readonly TableReconciliation[]
): string {
  const totalRows = report.reduce((sum, table) => sum + table.rowCount, 0)
  const tableCounts = report
    .map((table) => `${table.name}=${table.rowCount}`)
    .join(", ")
  return `${report.length} tables, ${totalRows} rows (${tableCounts})`
}

function summarizeTable(
  table: ExportSnapshot["tables"][number]
): TableReconciliation {
  const spec = tableSpecFor(table.name)
  return {
    checksum: hashJson(table.rows.map(stableStringify).sort()),
    idempotencyChecksum:
      spec.idempotencyColumns.length === 0
        ? null
        : hashJson(
            table.rows
              .map((row) => pickColumns(row, spec.idempotencyColumns))
              .sort()
          ),
    name: table.name,
    rowCount: table.rows.length,
  }
}

function pickColumns(row: MigrationRow, columns: readonly string[]): string {
  return stableStringify(columns.map((column) => [column, row[column] ?? null]))
}

function hashJson(value: JsonValue): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex")
}

function stableStringify(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}
