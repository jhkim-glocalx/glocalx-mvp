import {
  openPostgresDatabase,
  readDatabaseUrlDirect,
  resetPostgresDatabase,
  runPostgresCli,
} from "../src/server/db/postgres/migrations.ts"

await runPostgresCli(async () => {
  const sql = openPostgresDatabase(readDatabaseUrlDirect())

  try {
    await resetPostgresDatabase(sql)
  } finally {
    await sql.end()
  }
})
