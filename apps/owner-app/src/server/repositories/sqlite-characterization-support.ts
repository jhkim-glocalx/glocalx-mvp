import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { vi } from "vitest"

import { createIntegrationAdapters } from "@/integrations"
import type { IntegrationAdapters } from "@/integrations/contracts"
import { openDatabaseContext, type Queryable } from "@glocalx/db"
import {
  applyMigrations,
  seedDemoData,
  type SqliteDatabase,
} from "@glocalx/db/sqlite"

export type RepositoryTestContext = {
  readonly adapters: IntegrationAdapters
  readonly database: SqliteDatabase
  readonly queryable: Queryable
}

export async function withRepositoryTestContext(
  work: (context: RepositoryTestContext) => Promise<void> | void
): Promise<void> {
  const tempPath = await mkdtemp(join(tmpdir(), "glocalx-repository-"))
  const databasePath = join(tempPath, "repository.db")
  vi.stubEnv("GLOCALX_DB_PATH", databasePath)
  const databaseContext = await openDatabaseContext()
  applyMigrations(databaseContext.legacySqliteDatabase)
  seedDemoData(databaseContext.legacySqliteDatabase)
  const adapters = createIntegrationAdapters({ env: {} })

  try {
    await work({
      adapters,
      database: databaseContext.legacySqliteDatabase,
      queryable: databaseContext.queryable,
    })
  } finally {
    vi.unstubAllEnvs()
    await databaseContext.close()
    await rm(tempPath, { force: true, recursive: true })
  }
}
