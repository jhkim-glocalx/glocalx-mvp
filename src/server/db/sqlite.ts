import { mkdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import Database from "better-sqlite3"

export { seedDemoData } from "./seed-demo.ts"

export const requiredTableNames = [
  "users",
  "email_credentials",
  "stores",
  "user_sessions",
  "auth_identities",
  "business_profile_extractions",
  "oauth_connections",
  "gbp_accounts",
  "gbp_locations",
  "post_drafts",
  "post_publish_attempts",
  "conversation_sessions",
  "conversation_messages",
  "conversation_slot_values",
  "conversation_events",
  "reviews",
  "review_replies",
  "job_runs",
  "audit_logs",
] as const

export const operationalTableNames = ["auth_rate_limits"] as const
export const databaseTableNames = [
  ...requiredTableNames,
  ...operationalTableNames,
] as const

export type RequiredTableName = (typeof requiredTableNames)[number]
export type SqliteDatabase = Database.Database

export const tableCountQueries = {
  users: "SELECT COUNT(*) AS count FROM users",
  email_credentials: "SELECT COUNT(*) AS count FROM email_credentials",
  user_sessions: "SELECT COUNT(*) AS count FROM user_sessions",
  stores: "SELECT COUNT(*) AS count FROM stores",
  auth_identities: "SELECT COUNT(*) AS count FROM auth_identities",
  business_profile_extractions:
    "SELECT COUNT(*) AS count FROM business_profile_extractions",
  oauth_connections: "SELECT COUNT(*) AS count FROM oauth_connections",
  gbp_accounts: "SELECT COUNT(*) AS count FROM gbp_accounts",
  gbp_locations: "SELECT COUNT(*) AS count FROM gbp_locations",
  post_drafts: "SELECT COUNT(*) AS count FROM post_drafts",
  post_publish_attempts: "SELECT COUNT(*) AS count FROM post_publish_attempts",
  conversation_sessions: "SELECT COUNT(*) AS count FROM conversation_sessions",
  conversation_messages: "SELECT COUNT(*) AS count FROM conversation_messages",
  conversation_slot_values:
    "SELECT COUNT(*) AS count FROM conversation_slot_values",
  conversation_events: "SELECT COUNT(*) AS count FROM conversation_events",
  reviews: "SELECT COUNT(*) AS count FROM reviews",
  review_replies: "SELECT COUNT(*) AS count FROM review_replies",
  job_runs: "SELECT COUNT(*) AS count FROM job_runs",
  audit_logs: "SELECT COUNT(*) AS count FROM audit_logs",
} satisfies Record<RequiredTableName, string>

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirectory = dirname(currentFilePath)
const migrationPaths = [
  join(currentDirectory, "migrations", "0001_glocalx_schema.sql"),
  join(currentDirectory, "migrations", "0002_email_credentials.sql"),
  join(currentDirectory, "migrations", "0003_user_sessions.sql"),
  join(currentDirectory, "migrations", "0004_auth_rate_limits.sql"),
] as const

function ensureColumn(
  database: SqliteDatabase,
  tableName: string,
  columnName: string,
  definition: string
): void {
  const rows = database.prepare(`PRAGMA table_info(${tableName})`).all()
  const hasColumn = rows.some(
    (row) =>
      typeof row === "object" &&
      row !== null &&
      "name" in row &&
      row.name === columnName
  )

  if (!hasColumn) {
    database.exec(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`
    )
  }
}

export function resolveDefaultDatabasePath(
  env: Readonly<Record<string, string | undefined>> = process.env
): string {
  const configuredDatabasePath = env["GLOCALX_DB_PATH"]?.trim()
  if (configuredDatabasePath) {
    return configuredDatabasePath
  }

  if (env["VERCEL"] === "1") {
    return join(tmpdir(), "glocalx", "dev.db")
  }

  return ".glocalx/dev.db"
}

export const defaultDatabasePath = resolveDefaultDatabasePath()

export function resetDatabaseFile(
  databasePath: string = resolveDefaultDatabasePath()
): void {
  rmSync(databasePath, { force: true })
}

export function openDatabase(
  databasePath: string = resolveDefaultDatabasePath()
): SqliteDatabase {
  mkdirSync(dirname(databasePath), { recursive: true })
  const database = new Database(databasePath)
  database.pragma("foreign_keys = ON")
  return database
}

export function applyMigrations(database: SqliteDatabase): void {
  for (const migrationPath of migrationPaths) {
    database.exec(readFileSync(migrationPath, "utf8"))
  }
  ensureColumn(database, "post_drafts", "revision_of_draft_id", "TEXT")
  ensureColumn(database, "post_drafts", "marketing_preview_json", "TEXT")
}
