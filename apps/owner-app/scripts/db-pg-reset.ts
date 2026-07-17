import {
  openPostgresDatabase,
  readDatabaseUrlDirect,
  resetPostgresDatabase,
  runPostgresCli,
} from "@glocalx/db/postgres/migrations"
import { assertPostgresResetAllowed } from "@glocalx/db/postgres/reset-guard"

await runPostgresCli(async () => {
  const databaseUrl = readDatabaseUrlDirect()
  assertPostgresResetAllowed(process.env, databaseUrl)
  const sql = openPostgresDatabase(databaseUrl)

  try {
    await resetPostgresDatabase(sql)
  } finally {
    await sql.end()
  }
})
