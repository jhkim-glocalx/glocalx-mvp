import {
  DatabaseConfigurationError,
  resolveDatabaseConfig,
} from "@glocalx/db/config"
import type { DatabaseConfig } from "@glocalx/db/config"
import {
  openPostgresDatabase,
  readDatabaseUrlDirect,
} from "@glocalx/db/postgres/migrations"
import {
  openDatabase,
  resolveDefaultDatabasePath,
} from "@glocalx/db/sqlite"
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
