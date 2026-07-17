import {
  openPostgresDatabase,
  readDatabaseUrlDirect,
  runPostgresCli,
  verifyPostgresDatabase,
  verifyPostgresMigrationSource,
} from "@glocalx/db/postgres/migrations"

await runPostgresCli(async () => {
  verifyPostgresMigrationSource()

  const sql = openPostgresDatabase(readDatabaseUrlDirect())

  try {
    await verifyPostgresDatabase(sql)
  } finally {
    await sql.end()
  }
})
