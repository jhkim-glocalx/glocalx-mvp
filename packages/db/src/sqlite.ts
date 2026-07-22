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

export const operationalTableNames = [
  "auth_rate_limits",
  "admin_users",
  "admin_sessions",
  "cs_conversations",
  "cs_messages",
  "cs_message_context",
  "activity_events",
  "campaign_requests",
  "campaign_assets",
  "campaign_review_events",
  "publish_jobs",
] as const
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
  // 0005 and 0008 are Postgres-only (SQLite handles social channels and the
  // cs AI-mode widening in code below); numbering stays aligned across dialects.
  join(currentDirectory, "migrations", "0006_admin_identity.sql"),
  join(currentDirectory, "migrations", "0007_cs_chat_activity.sql"),
  join(currentDirectory, "migrations", "0009_campaign_pipeline.sql"),
] as const

const sqlIdentifierPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/

// Callers only ever pass hardcoded migration literals, never request-derived
// values, but the table/column names below are interpolated straight into
// DDL text rather than bound as parameters (SQLite doesn't support
// parameterizing identifiers). Assert the shape so this stays true if a
// future caller is tempted to pass through anything less trusted.
function ensureColumn(
  database: SqliteDatabase,
  tableName: string,
  columnName: string,
  definition: string
): void {
  if (
    !sqlIdentifierPattern.test(tableName) ||
    !sqlIdentifierPattern.test(columnName)
  ) {
    throw new Error(
      `ensureColumn: unsafe identifier "${tableName}"."${columnName}"`
    )
  }

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

function ensureSocialPostDraftChannels(database: SqliteDatabase): void {
  const row = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get("post_drafts") as { readonly sql?: string } | undefined
  if (row?.sql?.includes("'INSTAGRAM'") === true) {
    return
  }

  database.pragma("foreign_keys = OFF")
  try {
    database.exec(`
      BEGIN;
      CREATE TABLE post_drafts_social_upgrade (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL REFERENCES stores(id),
        owner_intent TEXT NOT NULL,
        target_channel TEXT NOT NULL CHECK (target_channel IN ('GBP', 'INSTAGRAM')),
        status TEXT NOT NULL CHECK (status IN ('DRAFT', 'APPROVED', 'PUBLISHED', 'FAILED')),
        korean_copy TEXT NOT NULL,
        english_copy TEXT NOT NULL,
        revision_of_draft_id TEXT REFERENCES post_drafts_social_upgrade(id),
        marketing_preview_json TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO post_drafts_social_upgrade (
        id, store_id, owner_intent, target_channel, status, korean_copy,
        english_copy, revision_of_draft_id, marketing_preview_json, created_at
      )
      SELECT id, store_id, owner_intent, target_channel, status, korean_copy,
        english_copy, revision_of_draft_id, marketing_preview_json, created_at
      FROM post_drafts;
      DROP TABLE post_drafts;
      ALTER TABLE post_drafts_social_upgrade RENAME TO post_drafts;
      COMMIT;
    `)
  } catch (error) {
    if (database.inTransaction) {
      database.exec("ROLLBACK")
    }
    throw error
  } finally {
    database.pragma("foreign_keys = ON")
  }
}

// Phase 2: widen cs_conversations.mode to add the 'ai_draft' posture and add the
// AI-failure flag columns. SQLite cannot ALTER a CHECK constraint, so rebuild the
// table (the ensureSocialPostDraftChannels pattern). Guarded on the widened CHECK
// already being present, and idempotent because every open re-runs applyMigrations.
function ensureAiDraftConversationMode(database: SqliteDatabase): void {
  const row = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get("cs_conversations") as { readonly sql?: string } | undefined
  if (row === undefined || row.sql === undefined) {
    // cs_conversations not created yet (migrations run before this helper only
    // on a populated schema) — nothing to upgrade.
    return
  }
  if (row.sql.includes("'ai_draft'")) {
    return
  }

  database.pragma("foreign_keys = OFF")
  try {
    database.exec(`
      BEGIN;
      CREATE TABLE cs_conversations_ai_mode_upgrade (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        mode TEXT NOT NULL CHECK (mode IN ('ai_draft', 'ai', 'human')),
        status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
        assigned_admin_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
        flagged_at TEXT,
        flag_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO cs_conversations_ai_mode_upgrade (
        id, store_id, mode, status, assigned_admin_id, flagged_at, flag_reason,
        created_at, updated_at
      )
      SELECT id, store_id, mode, status, assigned_admin_id, NULL, NULL,
        created_at, updated_at
      FROM cs_conversations;
      DROP TABLE cs_conversations;
      ALTER TABLE cs_conversations_ai_mode_upgrade RENAME TO cs_conversations;
      CREATE INDEX IF NOT EXISTS cs_conversations_status_updated_idx
        ON cs_conversations (status, updated_at);
      CREATE UNIQUE INDEX IF NOT EXISTS cs_conversations_one_open_per_store_idx
        ON cs_conversations (store_id)
        WHERE status = 'open';
      COMMIT;
    `)
  } catch (error) {
    if (database.inTransaction) {
      database.exec("ROLLBACK")
    }
    throw error
  } finally {
    database.pragma("foreign_keys = ON")
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
  ensureSocialPostDraftChannels(database)
  ensureColumn(
    database,
    "post_publish_attempts",
    "platform",
    "TEXT NOT NULL DEFAULT 'GBP'"
  )
  ensureColumn(database, "post_publish_attempts", "external_post_id", "TEXT")
  database.exec(
    "UPDATE post_publish_attempts SET external_post_id = gbp_post_id WHERE external_post_id IS NULL AND gbp_post_id IS NOT NULL"
  )
  // Phase 2 (matches postgres/migrations/0008_cs_ai_mode.sql).
  ensureAiDraftConversationMode(database)
  ensureColumn(
    database,
    "cs_messages",
    "status",
    "TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'draft'))"
  )
  database.exec(
    `CREATE INDEX IF NOT EXISTS cs_messages_owner_visible_cursor_idx
       ON cs_messages (conversation_id, created_at, id)
      WHERE status = 'sent'`
  )
  // Phase 3 (matches postgres/migrations/0010_campaign_final_copy.sql).
  ensureColumn(database, "campaign_requests", "final_copy", "TEXT")
}
