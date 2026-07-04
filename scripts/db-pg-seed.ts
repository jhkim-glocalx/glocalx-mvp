import {
  migratePostgresDatabase,
  openPostgresDatabase,
  readDatabaseUrlDirect,
  runPostgresCli,
  seedPostgresDemoData,
} from "../src/server/db/postgres/migrations.ts"

await runPostgresCli(async () => {
  const sql = openPostgresDatabase(readDatabaseUrlDirect())

  try {
    await migratePostgresDatabase(sql)
    await seedPostgresDemoData(sql)
  } finally {
    await sql.end()
  }
})
