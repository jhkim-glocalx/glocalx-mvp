import {
  openPostgresDatabase,
  readDatabaseUrlDirect,
  runPostgresCli,
  verifyPostgresDatabase,
  verifyPostgresMigrationSource,
} from "../src/server/db/postgres/migrations.ts"

await runPostgresCli(async () => {
  verifyPostgresMigrationSource()

  const sql = openPostgresDatabase(readDatabaseUrlDirect())

  try {
    await verifyPostgresDatabase(sql)
  } finally {
    await sql.end()
  }
})
