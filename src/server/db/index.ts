import { DatabaseConfigurationError, resolveDatabaseConfig } from "./config.ts"
import { openSqliteDatabaseContext } from "./sqlite-client.ts"
import type { DatabaseContext } from "./types.ts"

export { DatabaseConfigurationError } from "./config.ts"
export type {
  DatabaseContext,
  DatabaseExecutionResult,
  DatabaseRow,
  DatabaseStatementParameters,
  Queryable,
} from "./types.ts"

function assertNeverProvider(provider: never): never {
  throw new DatabaseConfigurationError(provider)
}

export async function openDatabaseContext(): Promise<DatabaseContext> {
  const config = resolveDatabaseConfig()

  switch (config.provider) {
    case "sqlite":
      return openSqliteDatabaseContext()
    default:
      return assertNeverProvider(config.provider)
  }
}
