import { mkdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import Database from "better-sqlite3"

export const requiredTableNames = [
  "users",
  "stores",
  "auth_identities",
  "business_profile_extractions",
  "oauth_connections",
  "gbp_accounts",
  "gbp_locations",
  "post_drafts",
  "post_publish_attempts",
  "reviews",
  "review_replies",
  "job_runs",
  "audit_logs",
] as const

export type RequiredTableName = (typeof requiredTableNames)[number]
export type SqliteDatabase = Database.Database

export const tableCountQueries = {
  users: "SELECT COUNT(*) AS count FROM users",
  stores: "SELECT COUNT(*) AS count FROM stores",
  auth_identities: "SELECT COUNT(*) AS count FROM auth_identities",
  business_profile_extractions:
    "SELECT COUNT(*) AS count FROM business_profile_extractions",
  oauth_connections: "SELECT COUNT(*) AS count FROM oauth_connections",
  gbp_accounts: "SELECT COUNT(*) AS count FROM gbp_accounts",
  gbp_locations: "SELECT COUNT(*) AS count FROM gbp_locations",
  post_drafts: "SELECT COUNT(*) AS count FROM post_drafts",
  post_publish_attempts: "SELECT COUNT(*) AS count FROM post_publish_attempts",
  reviews: "SELECT COUNT(*) AS count FROM reviews",
  review_replies: "SELECT COUNT(*) AS count FROM review_replies",
  job_runs: "SELECT COUNT(*) AS count FROM job_runs",
  audit_logs: "SELECT COUNT(*) AS count FROM audit_logs",
} satisfies Record<RequiredTableName, string>

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirectory = dirname(currentFilePath)
const migrationPath = join(
  currentDirectory,
  "migrations",
  "0001_glocalx_schema.sql"
)

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
  databasePath: string = defaultDatabasePath
): void {
  rmSync(databasePath, { force: true })
}

export function openDatabase(
  databasePath: string = defaultDatabasePath
): SqliteDatabase {
  mkdirSync(dirname(databasePath), { recursive: true })
  const database = new Database(databasePath)
  database.pragma("foreign_keys = ON")
  return database
}

export function applyMigrations(database: SqliteDatabase): void {
  database.exec(readFileSync(migrationPath, "utf8"))
  ensureColumn(database, "post_drafts", "revision_of_draft_id", "TEXT")
  ensureColumn(database, "post_drafts", "marketing_preview_json", "TEXT")
}

export function seedDemoData(database: SqliteDatabase): void {
  const createdAt = "2026-06-04T00:00:00.000Z"

  database
    .prepare(
      "INSERT OR IGNORE INTO users (id, email, display_name, role, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      "demo-owner",
      "demo-owner@glocalx.example",
      "Demo Owner",
      "OWNER",
      createdAt
    )

  database
    .prepare(
      "INSERT OR IGNORE INTO stores (id, owner_user_id, name, address, phone, category, hours, onboarding_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      "demo-store",
      "demo-owner",
      "브런치모먼트 홍대점",
      "서울 마포구 와우산로 123",
      "02-123-4567",
      "브런치 카페",
      "09:00 ~ 21:00",
      "COMPLETED",
      createdAt
    )

  database
    .prepare(
      "INSERT OR IGNORE INTO auth_identities (id, user_id, provider, provider_subject_id, email, display_name, encrypted_access_token, encrypted_refresh_token, scopes_json, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      "demo-auth-google",
      "demo-owner",
      "GOOGLE",
      "demo-google-login-subject",
      "demo-owner@glocalx.example",
      "Demo Owner",
      "encrypted:demo-login-access-token",
      "encrypted:demo-login-refresh-token",
      JSON.stringify(["openid", "email", "profile"]),
      "2026-06-05T00:00:00.000Z",
      createdAt,
      createdAt
    )

  database
    .prepare(
      "INSERT OR IGNORE INTO business_profile_extractions (id, store_id, source, source_input, status, candidate_json, missing_fields_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      "demo-extraction",
      "demo-store",
      "NAVER_LOCAL",
      "https://naver.me/mybrunchcafe",
      "CONFIRMED",
      JSON.stringify({ name: "브런치모먼트 홍대점" }),
      JSON.stringify(["hours"]),
      createdAt
    )

  database
    .prepare(
      "INSERT OR IGNORE INTO oauth_connections (id, store_id, provider, subject_id, encrypted_access_token, encrypted_refresh_token, scopes_json, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      "demo-oauth-google",
      "demo-store",
      "GOOGLE",
      "demo-google-subject",
      "encrypted:demo-access-token",
      "encrypted:demo-refresh-token",
      JSON.stringify(["https://www.googleapis.com/auth/business.manage"]),
      "2026-06-05T00:00:00.000Z",
      createdAt
    )

  database
    .prepare(
      "INSERT OR IGNORE INTO gbp_accounts (id, store_id, google_account_id, account_name, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      "demo-gbp-account",
      "demo-store",
      "accounts/demo",
      "Demo GBP Account",
      createdAt
    )

  database
    .prepare(
      "INSERT OR IGNORE INTO gbp_locations (id, store_id, gbp_account_id, google_location_id, status, request_admin_rights_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      "demo-gbp-location",
      "demo-store",
      "demo-gbp-account",
      "locations/demo",
      "VERIFIED",
      null,
      createdAt,
      createdAt
    )

  database
    .prepare(
      "INSERT OR IGNORE INTO post_drafts (id, store_id, owner_intent, target_channel, status, korean_copy, english_copy, created_at, revision_of_draft_id, marketing_preview_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      "demo-post-draft",
      "demo-store",
      "주말 브런치 신메뉴 홍보",
      "GBP",
      "DRAFT",
      "이번 주말 브런치 신메뉴를 만나보세요.",
      "Try our new weekend brunch menu.",
      createdAt,
      null,
      null
    )

  database
    .prepare(
      "INSERT OR IGNORE INTO post_publish_attempts (id, draft_id, idempotency_key, attempt_number, status, gbp_post_id, public_url, error_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      "demo-post-attempt",
      "demo-post-draft",
      "demo-post-publish-key",
      1,
      "SUCCEEDED",
      "gbp-post-demo",
      "https://business.google.com/demo-post",
      null,
      createdAt
    )

  database
    .prepare(
      "INSERT OR IGNORE INTO reviews (id, store_id, source_channel, raw_review_id, rating, reviewer_name, review_text, detected_language, sentiment, created_at, reply_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      "demo-review",
      "demo-store",
      "GBP",
      "raw-review-demo",
      5,
      "Alex",
      "Great brunch and kind staff.",
      "en",
      "POSITIVE",
      createdAt,
      "SUGGESTED"
    )

  database
    .prepare(
      "INSERT OR IGNORE INTO review_replies (id, review_id, selected_tone, reply_text, translated_reply_text, status, gbp_reply_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      "demo-review-reply",
      "demo-review",
      "polite",
      "정성스러운 리뷰 감사합니다. 다시 찾아주시면 더 좋은 브런치로 보답하겠습니다.",
      "Thank you for your thoughtful review. We hope to welcome you again.",
      "DRAFT",
      null,
      createdAt
    )

  database
    .prepare(
      "INSERT OR IGNORE INTO job_runs (id, store_id, job_type, status, idempotency_key, run_after, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      "demo-job-run",
      "demo-store",
      "REVIEW_SYNC",
      "SCHEDULED",
      "demo-review-sync-key",
      "2026-06-04T00:15:00.000Z",
      0,
      createdAt,
      createdAt
    )

  database
    .prepare(
      "INSERT OR IGNORE INTO audit_logs (id, store_id, actor_user_id, action, idempotency_key, redacted_payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      "demo-audit-log",
      "demo-store",
      "demo-owner",
      "demo.seed",
      "demo-seed-key",
      JSON.stringify({ token: "[REDACTED]" }),
      createdAt
    )
}
