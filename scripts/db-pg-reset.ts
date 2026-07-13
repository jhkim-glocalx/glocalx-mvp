import {
  openPostgresDatabase,
  readDatabaseUrlDirect,
  resetPostgresDatabase,
  runPostgresCli,
} from "../src/server/db/postgres/migrations.ts"
import { assertPostgresResetAllowed } from "../src/server/db/postgres/reset-guard.ts"

await runPostgresCli(async () => {
  assertPostgresResetAllowed(process.env)
  const sql = openPostgresDatabase(readDatabaseUrlDirect())

  try {
    await resetPostgresDatabase(sql)
  } finally {
    await sql.end()
  }
})
