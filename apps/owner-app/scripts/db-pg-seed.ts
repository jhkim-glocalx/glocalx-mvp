import {
  migratePostgresDatabase,
  openPostgresDatabase,
  readDatabaseUrlDirect,
  runPostgresCli,
  seedPostgresDemoData,
} from "@glocalx/db/postgres/migrations"

await runPostgresCli(async () => {
  const sql = openPostgresDatabase(readDatabaseUrlDirect())

  try {
    await migratePostgresDatabase(sql)
    await seedPostgresDemoData(sql)
  } finally {
    await sql.end()
  }
})
