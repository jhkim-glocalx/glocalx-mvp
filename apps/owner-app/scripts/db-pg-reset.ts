import {
  openPostgresDatabase,
  readDatabaseUrlDirect,
  resetPostgresDatabase,
  runPostgresCli,
} from "../src/server/db/postgres/migrations.ts"
import { assertPostgresResetAllowed } from "../src/server/db/postgres/reset-guard.ts"

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
