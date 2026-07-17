import { randomUUID } from "node:crypto"

import { resetAndSeedDatabaseForProvider } from "@glocalx/db/reset-seed"
import { applyMigrations, openDatabase } from "@glocalx/db/sqlite"
import { hashPassword } from "@glocalx/domain/password-hash"

import { crossDatabasePath, e2eAdminEmail, e2eAdminPassword } from "./harness"

export default async function globalSetup(): Promise<void> {
  const env = {
    ...process.env,
    DATABASE_PROVIDER: "sqlite",
    GLOCALX_DB_PATH: crossDatabasePath,
  }
  await resetAndSeedDatabaseForProvider(env)

  // The admin app has no registration route, so the cross-app specs need a
  // seeded operator account.
  const database = openDatabase(crossDatabasePath)
  try {
    applyMigrations(database)
    database
      .prepare(
        "INSERT INTO admin_users (id, email, password_hash, display_name, role, status, created_at) VALUES (?, ?, ?, ?, 'OPERATOR', 'ACTIVE', ?)"
      )
      .run(
        randomUUID(),
        e2eAdminEmail,
        await hashPassword(e2eAdminPassword),
        "E2E Operator",
        new Date().toISOString()
      )
  } finally {
    database.close()
  }
}
