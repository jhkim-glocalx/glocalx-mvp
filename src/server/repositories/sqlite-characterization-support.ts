import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { vi } from "vitest"

import { createIntegrationAdapters } from "@/integrations"
import type { IntegrationAdapters } from "@/integrations/contracts"
import {
  applyMigrations,
  openDatabase,
  seedDemoData,
  type SqliteDatabase,
} from "@/server/db/sqlite"

export type RepositoryTestContext = {
  readonly adapters: IntegrationAdapters
  readonly database: SqliteDatabase
}

export async function withRepositoryTestContext(
  work: (context: RepositoryTestContext) => Promise<void> | void
): Promise<void> {
  const tempPath = await mkdtemp(join(tmpdir(), "glocalx-repository-"))
  const databasePath = join(tempPath, "repository.db")
  vi.stubEnv("GLOCALX_DB_PATH", databasePath)
  const database = openDatabase(databasePath)
  applyMigrations(database)
  seedDemoData(database)
  const adapters = createIntegrationAdapters({ database, env: {} })

  try {
    await work({ adapters, database })
  } finally {
    vi.unstubAllEnvs()
    database.close()
    await rm(tempPath, { force: true, recursive: true })
  }
}
