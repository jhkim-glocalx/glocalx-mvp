import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { requiredTableNames } from "../sqlite.ts"
import { PostgresSchemaVerificationError } from "./errors.ts"

export type Migration = {
  readonly checksum: string
  readonly name: string
  readonly sql: string
  readonly version: string
}

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirectory = dirname(currentFilePath)
const migrationsDirectory = join(currentDirectory, "migrations")
const migrationFilePattern = /^(?<version>[0-9]+)_(?<name>[a-z0-9_]+)\.sql$/

export function loadPostgresMigrations(): readonly Migration[] {
  return readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .flatMap((entry) => {
      const match = migrationFilePattern.exec(entry.name)
      const version = match?.groups?.["version"]
      const name = match?.groups?.["name"]
      if (version === undefined || name === undefined) {
        return []
      }

      const path = join(migrationsDirectory, entry.name)
      const sql = readFileSync(path, "utf8")
      return [
        {
          checksum: createHash("sha256").update(sql).digest("hex"),
          name,
          sql,
          version,
        },
      ]
    })
    .sort((left, right) => left.version.localeCompare(right.version))
}

export function collectCreateTableNames(sql: string): readonly string[] {
  const matches = sql.matchAll(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?<name>[a-z0-9_]+)/gi
  )

  return [...matches].flatMap((match) => {
    const name = match.groups?.["name"]
    return name === undefined ? [] : [name]
  })
}

export function verifyPostgresMigrationSource(): void {
  const migrationSql = loadPostgresMigrations()
    .map((migration) => migration.sql)
    .join("\n")
  const createdTableNames = new Set(collectCreateTableNames(migrationSql))
  const missingTableNames = requiredTableNames.filter(
    (tableName) => !createdTableNames.has(tableName)
  )

  if (missingTableNames.length > 0) {
    throw new PostgresSchemaVerificationError(
      `Postgres migrations are missing required tables: ${missingTableNames.join(", ")}`
    )
  }
}
