import { requiredTableNames } from "../sqlite.ts"
import type { PostgresClient } from "./connection.ts"
import {
  PostgresMigrationChecksumError,
  PostgresSchemaVerificationError,
} from "./errors.ts"
import { loadPostgresMigrations } from "./schema-source.ts"

type MigrationRow = {
  readonly checksum: string
  readonly version: string
}

type TableNameRow = {
  readonly name: string
}

export async function migratePostgresDatabase(
  sql: PostgresClient
): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS glocalx_schema_migrations (
      version text PRIMARY KEY,
      name text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `

  const appliedRows = await sql<MigrationRow[]>`
    SELECT version, checksum
    FROM glocalx_schema_migrations
  `
  const appliedChecksums = new Map(
    appliedRows.map((row) => [row.version, row.checksum])
  )

  for (const migration of loadPostgresMigrations()) {
    const appliedChecksum = appliedChecksums.get(migration.version)
    if (appliedChecksum === migration.checksum) {
      console.log(`Postgres migration ${migration.version} already applied`)
      continue
    }

    if (appliedChecksum !== undefined) {
      throw new PostgresMigrationChecksumError(migration.version)
    }

    await sql.begin(async (transaction) => {
      await transaction.unsafe(migration.sql)
      await transaction`
        INSERT INTO glocalx_schema_migrations (version, name, checksum)
        VALUES (${migration.version}, ${migration.name}, ${migration.checksum})
      `
    })
    console.log(`Applied Postgres migration ${migration.version}`)
  }
}

export async function verifyPostgresDatabase(
  sql: PostgresClient
): Promise<void> {
  const tableRows = await sql<TableNameRow[]>`
    SELECT table_name AS name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  `
  const existingTableNames = new Set(tableRows.map((row) => row.name))
  const missingTableNames = requiredTableNames.filter(
    (tableName) => !existingTableNames.has(tableName)
  )

  if (missingTableNames.length > 0) {
    throw new PostgresSchemaVerificationError(
      `Postgres database is missing required tables: ${missingTableNames.join(", ")}`
    )
  }

  if (!existingTableNames.has("glocalx_schema_migrations")) {
    throw new PostgresSchemaVerificationError(
      "Postgres database is missing glocalx_schema_migrations"
    )
  }

  console.log(
    `Verified Postgres schema with ${requiredTableNames.length} durable tables`
  )
}

export async function resetPostgresDatabase(
  sql: PostgresClient
): Promise<void> {
  await sql`DROP SCHEMA IF EXISTS public CASCADE`
  await sql`CREATE SCHEMA public`
  await sql`GRANT ALL ON SCHEMA public TO PUBLIC`
  console.log("Reset Postgres public schema")
  await migratePostgresDatabase(sql)
}
