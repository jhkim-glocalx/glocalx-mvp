import { randomUUID } from "node:crypto"

import { openDatabaseContext } from "@glocalx/db"
import { hashPassword } from "@glocalx/domain/password-hash"

// Invite-only admin provisioning: there is deliberately no registration
// route, so the first (and every) admin is seeded from a shell with
// credentials passed via environment variables — never argv, which would
// leak the password into shell history and process listings.
const email = process.env["ADMIN_SEED_EMAIL"]?.trim().toLowerCase()
const password = process.env["ADMIN_SEED_PASSWORD"]
const displayName = process.env["ADMIN_SEED_NAME"]?.trim() || "Operator"
const role = process.env["ADMIN_SEED_ROLE"]?.trim().toUpperCase() || "OWNER"

if (!email || !password) {
  console.error(
    "Usage: ADMIN_SEED_EMAIL=... ADMIN_SEED_PASSWORD=... [ADMIN_SEED_NAME=...] [ADMIN_SEED_ROLE=OWNER|OPERATOR] npm run seed:admin -w apps/admin"
  )
  process.exit(1)
}

if (role !== "OWNER" && role !== "OPERATOR") {
  console.error("ADMIN_SEED_ROLE must be OWNER or OPERATOR.")
  process.exit(1)
}

if (password.length < 12) {
  console.error("ADMIN_SEED_PASSWORD must be at least 12 characters.")
  process.exit(1)
}

const databaseContext = await openDatabaseContext()
try {
  const passwordHash = await hashPassword(password)
  const now = new Date().toISOString()
  const existing = await databaseContext.queryable.queryOne(
    "SELECT id FROM admin_users WHERE email = ?",
    [email]
  )
  if (existing !== undefined) {
    await databaseContext.queryable.execute(
      "UPDATE admin_users SET password_hash = ?, display_name = ?, role = ?, status = 'ACTIVE' WHERE email = ?",
      [passwordHash, displayName, role, email]
    )
    console.log(`Updated admin account for ${email}.`)
  } else {
    await databaseContext.queryable.execute(
      "INSERT INTO admin_users (id, email, password_hash, display_name, role, status, created_at) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)",
      [randomUUID(), email, passwordHash, displayName, role, now]
    )
    console.log(`Created admin account for ${email}.`)
  }
} finally {
  await databaseContext.close()
}
