import { DatabaseConfigurationError, resolveDatabaseConfig } from "./config.ts"
import type { DatabaseConfig } from "./config.ts"
import {
  DatabaseUrlDirectConfigurationError,
  migratePostgresDatabase,
  openPostgresDatabase,
  PostgresMigrationChecksumError,
  PostgresSchemaVerificationError,
  readDatabaseUrlDirect,
  resetPostgresDatabase,
  seedPostgresDemoData,
} from "./postgres/migrations.ts"
import {
  applyMigrations,
  openDatabase,
  resetDatabaseFile,
  resolveDefaultDatabasePath,
  seedDemoData,
} from "./sqlite.ts"
import type { SqliteDatabase } from "./sqlite.ts"

type DatabaseEnvironment = Readonly<Record<string, string | undefined>>

export type ProviderAwareDatabaseResult =
  | {
      readonly provider: "postgres"
      readonly target: "DATABASE_URL_DIRECT"
    }
  | {
      readonly provider: "sqlite"
      readonly target: string
    }

function openMigratedSqliteDatabase(databasePath: string): SqliteDatabase {
  const database = openDatabase(databasePath)
  try {
    applyMigrations(database)
  } catch (error) {
    database.close()
    throw error
  }
  return database
}

function assertNeverDatabaseConfig(config: never): never {
  throw new DatabaseConfigurationError({
    code: "DATABASE_PROVIDER_UNSUPPORTED",
    message: `Unsupported database provider for reset/seed: ${String(config)}`,
    provider: undefined,
  })
}

function resetSqliteDatabaseForProvider(
  env: DatabaseEnvironment
): ProviderAwareDatabaseResult {
  const databasePath = resolveDefaultDatabasePath(env)
  resetDatabaseFile(databasePath)
  const database = openMigratedSqliteDatabase(databasePath)
  database.close()

  return {
    provider: "sqlite",
    target: databasePath,
  }
}

function seedSqliteDatabaseForProvider(
  env: DatabaseEnvironment
): ProviderAwareDatabaseResult {
  const databasePath = resolveDefaultDatabasePath(env)
  const database = openMigratedSqliteDatabase(databasePath)

  try {
    seedDemoData(database)
  } finally {
    database.close()
  }

  return {
    provider: "sqlite",
    target: databasePath,
  }
}

function resetAndSeedSqliteDatabaseForProvider(
  env: DatabaseEnvironment
): ProviderAwareDatabaseResult {
  const databasePath = resolveDefaultDatabasePath(env)
  resetDatabaseFile(databasePath)
  const database = openMigratedSqliteDatabase(databasePath)

  try {
    seedDemoData(database)
  } finally {
    database.close()
  }

  return {
    provider: "sqlite",
    target: databasePath,
  }
}

async function resetPostgresDatabaseForProvider(
  env: DatabaseEnvironment
): Promise<ProviderAwareDatabaseResult> {
  const sql = openPostgresDatabase(readDatabaseUrlDirect(env))

  try {
    await resetPostgresDatabase(sql)
  } finally {
    await sql.end()
  }

  return {
    provider: "postgres",
    target: "DATABASE_URL_DIRECT",
  }
}

async function seedPostgresDatabaseForProvider(
  env: DatabaseEnvironment
): Promise<ProviderAwareDatabaseResult> {
  const sql = openPostgresDatabase(readDatabaseUrlDirect(env))

  try {
    await migratePostgresDatabase(sql)
    await seedPostgresDemoData(sql)
  } finally {
    await sql.end()
  }

  return {
    provider: "postgres",
    target: "DATABASE_URL_DIRECT",
  }
}

async function resetAndSeedPostgresDatabaseForProvider(
  env: DatabaseEnvironment
): Promise<ProviderAwareDatabaseResult> {
  const sql = openPostgresDatabase(readDatabaseUrlDirect(env))

  try {
    await resetPostgresDatabase(sql)
    await seedPostgresDemoData(sql)
  } finally {
    await sql.end()
  }

  return {
    provider: "postgres",
    target: "DATABASE_URL_DIRECT",
  }
}

function resolveHarnessConfig(env: DatabaseEnvironment): DatabaseConfig {
  return resolveDatabaseConfig(env)
}

export async function resetDatabaseForProvider(
  env: DatabaseEnvironment = process.env
): Promise<ProviderAwareDatabaseResult> {
  const config = resolveHarnessConfig(env)

  switch (config.provider) {
    case "sqlite":
      return resetSqliteDatabaseForProvider(env)
    case "postgres":
      return resetPostgresDatabaseForProvider(env)
  }

  return assertNeverDatabaseConfig(config)
}

export async function seedDatabaseForProvider(
  env: DatabaseEnvironment = process.env
): Promise<ProviderAwareDatabaseResult> {
  const config = resolveHarnessConfig(env)

  switch (config.provider) {
    case "sqlite":
      return seedSqliteDatabaseForProvider(env)
    case "postgres":
      return seedPostgresDatabaseForProvider(env)
  }

  return assertNeverDatabaseConfig(config)
}

export async function resetAndSeedDatabaseForProvider(
  env: DatabaseEnvironment = process.env
): Promise<ProviderAwareDatabaseResult> {
  const config = resolveHarnessConfig(env)

  switch (config.provider) {
    case "sqlite":
      return resetAndSeedSqliteDatabaseForProvider(env)
    case "postgres":
      return resetAndSeedPostgresDatabaseForProvider(env)
  }

  return assertNeverDatabaseConfig(config)
}

export async function runProviderAwareDatabaseCli(
  action: () => Promise<ProviderAwareDatabaseResult>
): Promise<void> {
  try {
    const result = await action()
    console.log(
      `Completed ${result.provider} database operation at ${result.target}`
    )
  } catch (error) {
    if (
      error instanceof DatabaseConfigurationError ||
      error instanceof DatabaseUrlDirectConfigurationError ||
      error instanceof PostgresMigrationChecksumError ||
      error instanceof PostgresSchemaVerificationError
    ) {
      console.error(`${error.name}: ${error.message}`)
      process.exitCode = 1
      return
    }

    throw error
  }
}
