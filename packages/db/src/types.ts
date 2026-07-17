import type { SqliteDatabase } from "./sqlite.ts"

export type DatabaseRow = Readonly<Record<string, unknown>>

export type DatabaseStatementParameter =
  | null
  | boolean
  | number
  | string
  | Uint8Array
  | readonly DatabaseStatementParameter[]

export type DatabaseStatementParameters = readonly DatabaseStatementParameter[]

export type DatabaseExecutionResult = {
  readonly changes: number
  readonly lastInsertRowid: number | bigint
}

export interface Queryable {
  query(
    sql: string,
    parameters?: DatabaseStatementParameters
  ): Promise<readonly DatabaseRow[]>
  queryOne(
    sql: string,
    parameters?: DatabaseStatementParameters
  ): Promise<DatabaseRow | undefined>
  execute(
    sql: string,
    parameters?: DatabaseStatementParameters
  ): Promise<DatabaseExecutionResult>
  transaction(work: (transaction: Queryable) => Promise<void>): Promise<void>
}

export type DatabaseContext = {
  readonly queryable: Queryable
  readonly legacySqliteDatabase: SqliteDatabase
  readonly close: () => Promise<void>
}
