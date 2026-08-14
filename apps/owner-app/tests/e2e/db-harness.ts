import {
  DatabaseConfigurationError,
  resolveDatabaseConfig,
} from "@glocalx/db/config"
import type { DatabaseConfig } from "@glocalx/db/config"
import {
  openPostgresDatabase,
  readDatabaseUrlDirect,
} from "@glocalx/db/postgres/migrations"
import { openDatabase, resolveDefaultDatabasePath } from "@glocalx/db/sqlite"
import { resetAndSeedDatabaseForProvider } from "@glocalx/db/reset-seed"

type DatabaseEnvironment = Readonly<Record<string, string | undefined>>

export type DemoStoreOnboardingStatus = "COMPLETED" | "NOT_STARTED"

function assertNeverDatabaseConfig(config: never): never {
  throw new DatabaseConfigurationError({
    code: "DATABASE_PROVIDER_UNSUPPORTED",
    message: `Unsupported e2e database provider: ${String(config)}`,
    provider: undefined,
  })
}

export async function resetE2eDatabase(
  env: DatabaseEnvironment = process.env
): Promise<void> {
  await resetAndSeedDatabaseForProvider(env)
}

function updateSqliteDemoStoreOnboardingStatus(
  status: DemoStoreOnboardingStatus,
  env: DatabaseEnvironment
): void {
  const database = openDatabase(resolveDefaultDatabasePath(env))

  try {
    database
      .prepare("UPDATE stores SET onboarding_status = ? WHERE id = ?")
      .run(status, "demo-store")
  } finally {
    database.close()
  }
}

async function updatePostgresDemoStoreOnboardingStatus(
  status: DemoStoreOnboardingStatus,
  env: DatabaseEnvironment
): Promise<void> {
  const sql = openPostgresDatabase(readDatabaseUrlDirect(env))

  try {
    await sql`
      UPDATE stores
      SET onboarding_status = ${status}
      WHERE id = 'demo-store'
    `
  } finally {
    await sql.end()
  }
}

async function updateDemoStoreOnboardingStatus(
  status: DemoStoreOnboardingStatus,
  env: DatabaseEnvironment
): Promise<void> {
  const config: DatabaseConfig = resolveDatabaseConfig(env)

  switch (config.provider) {
    case "sqlite":
      return updateSqliteDemoStoreOnboardingStatus(status, env)
    case "postgres":
      return updatePostgresDemoStoreOnboardingStatus(status, env)
  }

  return assertNeverDatabaseConfig(config)
}

export async function resetFirstTimeE2eDatabase(
  env: DatabaseEnvironment = process.env
): Promise<void> {
  await resetE2eDatabase(env)
  await updateDemoStoreOnboardingStatus("NOT_STARTED", env)
}

function clearSqliteDemoStoreGbpLocation(env: DatabaseEnvironment): void {
  const database = openDatabase(resolveDefaultDatabasePath(env))

  try {
    database
      .prepare("DELETE FROM gbp_locations WHERE store_id = ?")
      .run("demo-store")
  } finally {
    database.close()
  }
}

async function clearPostgresDemoStoreGbpLocation(
  env: DatabaseEnvironment
): Promise<void> {
  const sql = openPostgresDatabase(readDatabaseUrlDirect(env))

  try {
    await sql`DELETE FROM gbp_locations WHERE store_id = 'demo-store'`
  } finally {
    await sql.end()
  }
}

/**
 * Puts the demo store back to "has never had a GBP listing".
 *
 * The seeded demo store ships with a VERIFIED listing so most suites can publish
 * against it. Specs that exercise GBP *setup* need the opposite: setup refuses to
 * create when a listing already exists, because creating a second one is how a
 * store ends up with a duplicate Google listing. Without this the setup path is
 * unreachable and those specs assert against the seeded listing instead of the
 * one under test.
 */
export async function resetE2eDatabaseWithoutGbpLocation(
  env: DatabaseEnvironment = process.env
): Promise<void> {
  await resetE2eDatabase(env)

  const config: DatabaseConfig = resolveDatabaseConfig(env)

  switch (config.provider) {
    case "sqlite":
      return clearSqliteDemoStoreGbpLocation(env)
    case "postgres":
      return clearPostgresDemoStoreGbpLocation(env)
  }

  return assertNeverDatabaseConfig(config)
}
