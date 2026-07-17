import {
  migratePostgresDatabase,
  openPostgresDatabase,
  readDatabaseUrlDirect,
  runPostgresCli,
} from "../src/server/db/postgres/migrations.ts"

await runPostgresCli(async () => {
  const sql = openPostgresDatabase(readDatabaseUrlDirect())

  try {
    await migratePostgresDatabase(sql)
  } finally {
    await sql.end()
  }
})
