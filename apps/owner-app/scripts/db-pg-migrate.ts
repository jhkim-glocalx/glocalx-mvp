import {
  migratePostgresDatabase,
  openPostgresDatabase,
  readDatabaseUrlDirect,
  runPostgresCli,
} from "@glocalx/db/postgres/migrations"

await runPostgresCli(async () => {
  const sql = openPostgresDatabase(readDatabaseUrlDirect())

  try {
    await migratePostgresDatabase(sql)
  } finally {
    await sql.end()
  }
})
