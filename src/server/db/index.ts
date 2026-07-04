import { resolveDatabaseConfig } from "./config.ts"
import { openPostgresDatabaseContext } from "./postgres/runtime-client.ts"
import { openSqliteDatabaseContext } from "./sqlite-client.ts"
import type { DatabaseContext } from "./types.ts"

export { DatabaseConfigurationError, resolveDatabaseConfig } from "./config.ts"
export type {
  DatabaseConfig,
  DatabaseConfigurationCode,
  DatabaseProvider,
  PostgresDatabaseConfig,
  SqliteDatabaseConfig,
} from "./config.ts"
export type {
  DatabaseContext,
  DatabaseExecutionResult,
  DatabaseRow,
  DatabaseStatementParameter,
  DatabaseStatementParameters,
  Queryable,
} from "./types.ts"

export async function openDatabaseContext(): Promise<DatabaseContext> {
  const config = resolveDatabaseConfig()

  switch (config.provider) {
    case "sqlite":
      return openSqliteDatabaseContext()
    case "postgres":
      return openPostgresDatabaseContext(config)
  }
}
