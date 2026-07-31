import {
  demoBaseTables,
  demoCohortTables,
  type DemoTable,
  type DemoValue,
} from "./demo-dataset.ts"
import type { SqliteDatabase } from "./sqlite"

const sqlIdentifierPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/

// Table and column names come only from the hardcoded demo-dataset literals,
// never from request input, but they are interpolated straight into DDL text
// (SQLite can't parameterize identifiers). Assert the shape so a future dataset
// edit that introduces an odd name fails loudly instead of building bad SQL.
function assertIdentifier(name: string): string {
  if (!sqlIdentifierPattern.test(name)) {
    throw new Error(`Unexpected SQL identifier in demo dataset: ${name}`)
  }
  return name
}

// JSON columns hold objects/arrays in the dataset; SQLite stores them as TEXT.
// Every other value is already a scalar SQLite binds directly.
function toSqliteValue(value: DemoValue | undefined): string | number | null {
  if (value === undefined) {
    return null
  }
  if (value !== null && typeof value === "object") {
    return JSON.stringify(value)
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0
  }
  return value
}

function seedTables(
  database: SqliteDatabase,
  tables: readonly DemoTable[]
): void {
  for (const { table, rows } of tables) {
    const [firstRow] = rows
    if (firstRow === undefined) {
      continue
    }
    const columns = Object.keys(firstRow).map(assertIdentifier)
    const placeholders = columns.map(() => "?").join(", ")
    const statement = database.prepare(
      `INSERT OR IGNORE INTO ${assertIdentifier(table)} (${columns.join(", ")}) VALUES (${placeholders})`
    )
    for (const row of rows) {
      statement.run(...columns.map((column) => toSqliteValue(row[column])))
    }
  }
}

// The unit-test fixture (~40 tests) — only the happy-path demo-store. Its
// behavior is preserved exactly, so those tests keep their predictable single
// store. INSERT OR IGNORE keeps a re-seed over an existing store a no-op.
export function seedDemoData(database: SqliteDatabase): void {
  seedTables(database, demoBaseTables)
}

// The additional cohort stores that place the operator consoles across every
// pipeline state — layered on top of the base fixture by the demo/staging seed
// path only (db:reset, db:seed), never by the unit-test fixture above.
export function seedDemoCohortData(database: SqliteDatabase): void {
  seedTables(database, demoCohortTables)
}

// The full demo/staging dataset: base happy-path store plus the cohort stores.
export function seedFullDemoData(database: SqliteDatabase): void {
  seedTables(database, demoBaseTables)
  seedTables(database, demoCohortTables)
}
