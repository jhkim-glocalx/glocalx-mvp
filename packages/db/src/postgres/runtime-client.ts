import postgres from "postgres"

import { DatabaseConfigurationError } from "../config.ts"
import type { PostgresDatabaseConfig } from "../config.ts"
import type { SqliteDatabase } from "../sqlite.ts"
import type {
  DatabaseContext,
  DatabaseExecutionResult,
  DatabaseRow,
  DatabaseStatementParameters,
  Queryable,
} from "../types.ts"
import type { PostgresClient } from "./connection.ts"

type PostgresRuntimeOptions = {
  readonly connection: {
    readonly statement_timeout: 30_000
  }
  readonly connect_timeout: number
  readonly idle_timeout: number
  readonly max: number
  readonly onnotice: () => void
  readonly prepare: false
  readonly ssl: false | "require"
}

type PostgresRuntimeConnectionConfig = {
  readonly poolMax: number
  readonly runtimeUrl: string
}

type PostgresExecutor = {
  readonly unsafe: PostgresClient["unsafe"]
}

type TransactionRunner = (
  work: (transaction: Queryable) => Promise<void>
) => Promise<void>

const localPostgresHosts = new Set([
  "127.0.0.1",
  "::1",
  "host.docker.internal",
  "localhost",
])

function usesLocalPostgresHost(runtimeUrl: string): boolean {
  const hostname = new URL(runtimeUrl).hostname.toLowerCase()
  return localPostgresHosts.has(hostname) || !hostname.includes(".")
}

function normalizePostgresPlaceholders(sql: string): string {
  let parameterIndex = 0
  return sql.replace(/\?/g, () => {
    parameterIndex += 1
    return `$${parameterIndex}`
  })
}

export function buildPostgresRuntimeOptions(
  config: PostgresRuntimeConnectionConfig
): PostgresRuntimeOptions {
  return {
    connection: {
      statement_timeout: 30_000,
    },
    connect_timeout: 5,
    idle_timeout: 30,
    max: config.poolMax,
    onnotice: () => undefined,
    prepare: false,
    ssl: usesLocalPostgresHost(config.runtimeUrl) ? false : "require",
  }
}

class PostgresQueryable implements Queryable {
  // Explicit fields instead of constructor parameter properties: Node runs
  // this package's TypeScript directly in strip-only mode, which rejects
  // non-erasable syntax like parameter properties.
  private readonly executor: PostgresExecutor
  private readonly runTransaction: TransactionRunner

  constructor(executor: PostgresExecutor, runTransaction: TransactionRunner) {
    this.executor = executor
    this.runTransaction = runTransaction
  }

  async query(
    sql: string,
    parameters: DatabaseStatementParameters = []
  ): Promise<readonly DatabaseRow[]> {
    return this.executor.unsafe<DatabaseRow[]>(
      normalizePostgresPlaceholders(sql),
      [...parameters],
      {
        prepare: false,
      }
    )
  }

  async queryOne(
    sql: string,
    parameters: DatabaseStatementParameters = []
  ): Promise<DatabaseRow | undefined> {
    const rows = await this.query(sql, parameters)
    return rows[0]
  }

  async execute(
    sql: string,
    parameters: DatabaseStatementParameters = []
  ): Promise<DatabaseExecutionResult> {
    const result = await this.executor.unsafe<DatabaseRow[]>(
      normalizePostgresPlaceholders(sql),
      [...parameters],
      { prepare: false }
    )

    return {
      changes: result.count,
      lastInsertRowid: 0,
    }
  }

  async transaction(
    work: (transaction: Queryable) => Promise<void>
  ): Promise<void> {
    await this.runTransaction(work)
  }
}

function createPostgresTransactionQueryable(
  transaction: postgres.TransactionSql
): Queryable {
  return new PostgresQueryable(transaction, async (work) => {
    await transaction.savepoint(async (savepoint) => {
      await work(createPostgresTransactionQueryable(savepoint))
    })
  })
}

export function openPostgresDatabaseContext(
  config: PostgresDatabaseConfig
): DatabaseContext {
  const client = postgres(
    config.runtimeUrl,
    buildPostgresRuntimeOptions(config)
  )
  const queryable = new PostgresQueryable(client, async (work) => {
    await client.begin(async (transaction) => {
      await work(createPostgresTransactionQueryable(transaction))
    })
  })

  return {
    close: async () => {
      await client.end({ timeout: 5 })
    },
    get legacySqliteDatabase(): SqliteDatabase {
      throw new DatabaseConfigurationError({
        code: "DATABASE_PROVIDER_UNSUPPORTED",
        message: "legacySqliteDatabase is unavailable in Postgres runtime mode",
        provider: "postgres",
      })
    },
    queryable,
  }
}
