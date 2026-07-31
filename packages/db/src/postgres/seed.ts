import { demoTables } from "../demo-dataset.ts"

import type { PostgresClient } from "./connection.ts"

// Seeds the full demo/staging dataset (base happy-path store + cohort stores)
// from the shared demo-dataset module, so Postgres and SQLite can never drift.
// postgres.js sends parameters with an unspecified type, so the server infers
// each column's type from the target column: ISO strings become timestamptz,
// numbers become integer, and JS objects/arrays are serialized and cast to
// jsonb. ON CONFLICT DO NOTHING mirrors SQLite's INSERT OR IGNORE, so a re-seed
// (db:pg:seed) is idempotent and both dialects behave identically.
export async function seedPostgresDemoData(sql: PostgresClient): Promise<void> {
  for (const { table, rows } of demoTables) {
    const [firstRow] = rows
    if (firstRow === undefined) {
      continue
    }
    const columns = Object.keys(firstRow)

    await sql`
      INSERT INTO ${sql(table)} ${sql(rows as Record<string, unknown>[], ...columns)}
      ON CONFLICT (id) DO NOTHING
    `
  }

  console.log("Seeded Postgres demo dataset (base store + cohort)")
}
