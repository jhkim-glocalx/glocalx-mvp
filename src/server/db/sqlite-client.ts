import { openDatabase } from "./sqlite.ts"
import type { SqliteDatabase } from "./sqlite.ts"
import type {
  DatabaseContext,
  DatabaseExecutionResult,
  DatabaseRow,
  DatabaseStatementParameters,
  Queryable,
} from "./types.ts"

class SqliteQueryable implements Queryable {
  constructor(private readonly database: SqliteDatabase) {}

  async query(
    sql: string,
    parameters: DatabaseStatementParameters = []
  ): Promise<readonly DatabaseRow[]> {
    return this.database
      .prepare<unknown[], DatabaseRow>(sql)
      .all(...[...parameters])
  }

  async queryOne(
    sql: string,
    parameters: DatabaseStatementParameters = []
  ): Promise<DatabaseRow | undefined> {
    return this.database
      .prepare<unknown[], DatabaseRow>(sql)
      .get(...[...parameters])
  }

  async execute(
    sql: string,
    parameters: DatabaseStatementParameters = []
  ): Promise<DatabaseExecutionResult> {
    const result = this.database.prepare<unknown[]>(sql).run(...[...parameters])

    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    }
  }

  async transaction(
    work: (transaction: Queryable) => Promise<void>
  ): Promise<void> {
    this.database.exec("BEGIN")

    try {
      await work(this)
      this.database.exec("COMMIT")
    } catch (error) {
      this.database.exec("ROLLBACK")
      throw error
    }
  }
}

export function openSqliteDatabaseContext(): DatabaseContext {
  const database = openDatabase()
  const queryable = new SqliteQueryable(database)

  return {
    close: async () => {
      database.close()
    },
    legacySqliteDatabase: database,
    queryable,
  }
}
