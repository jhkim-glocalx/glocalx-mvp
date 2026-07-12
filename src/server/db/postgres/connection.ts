import postgres from "postgres"

import {
  DatabaseUrlDirectConfigurationError,
  PostgresMigrationChecksumError,
  PostgresSchemaVerificationError,
} from "./errors.ts"
import { readConfiguredPostgresDirectUrl } from "./direct-url.ts"

export type PostgresClient = ReturnType<typeof postgres>

const postgresProtocols = new Set(["postgres:", "postgresql:"])

export async function runPostgresCli(
  action: () => Promise<void>
): Promise<void> {
  try {
    await action()
  } catch (error) {
    if (
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

export function readDatabaseUrlDirect(
  env: Readonly<Record<string, string | undefined>> = process.env
): string {
  const configuredUrl = readConfiguredPostgresDirectUrl(env)
  if (!configuredUrl) {
    throw new DatabaseUrlDirectConfigurationError(
      "DATABASE_URL_DIRECT, DATABASE_URL_UNPOOLED, or POSTGRES_URL_NON_POOLING is required for Postgres migration tooling"
    )
  }

  try {
    const parsedUrl = new URL(configuredUrl)
    if (!postgresProtocols.has(parsedUrl.protocol)) {
      throw new DatabaseUrlDirectConfigurationError(
        "DATABASE_URL_DIRECT must use a postgres:// or postgresql:// URL"
      )
    }
  } catch (error) {
    if (error instanceof DatabaseUrlDirectConfigurationError) {
      throw error
    }

    throw new DatabaseUrlDirectConfigurationError(
      "DATABASE_URL_DIRECT must be a valid Postgres connection URL"
    )
  }

  return configuredUrl
}

export function openPostgresDatabase(url: string): PostgresClient {
  return postgres(url, {
    connect_timeout: 5,
    idle_timeout: 5,
    max: 1,
    onnotice: () => undefined,
  })
}
