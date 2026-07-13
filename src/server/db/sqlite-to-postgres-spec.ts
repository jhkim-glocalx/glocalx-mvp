import type { RequiredTableName } from "./sqlite.ts"
import { MigrationInputError } from "./sqlite-to-postgres-errors.ts"

export type ColumnKind = "date" | "json" | "scalar"

export type TableSpec = {
  readonly deferredColumns?: readonly string[]
  readonly idempotencyColumns: readonly string[]
  readonly jsonColumns: readonly string[]
  readonly name: RequiredTableName
  readonly nullableJsonColumns?: readonly string[]
  readonly orderByColumn?: string
  readonly primaryKeyColumn?: string
}

export const sqliteToPostgresTableSpecs = [
  { name: "users", jsonColumns: [], idempotencyColumns: ["id", "email"] },
  {
    name: "email_credentials",
    jsonColumns: [],
    idempotencyColumns: ["user_id"],
    orderByColumn: "user_id",
    primaryKeyColumn: "user_id",
  },
  {
    name: "stores",
    jsonColumns: [],
    idempotencyColumns: ["id", "owner_user_id"],
  },
  {
    name: "user_sessions",
    jsonColumns: [],
    idempotencyColumns: ["id"],
  },
  {
    name: "auth_identities",
    jsonColumns: ["scopes_json"],
    idempotencyColumns: ["id", "provider_subject_id"],
  },
  {
    name: "business_profile_extractions",
    jsonColumns: ["candidate_json", "missing_fields_json"],
    idempotencyColumns: ["id", "store_id"],
  },
  {
    name: "oauth_connections",
    jsonColumns: ["scopes_json"],
    idempotencyColumns: ["id", "subject_id"],
  },
  {
    name: "gbp_accounts",
    jsonColumns: [],
    idempotencyColumns: ["id", "google_account_id"],
  },
  {
    name: "gbp_locations",
    jsonColumns: [],
    idempotencyColumns: ["id", "google_location_id"],
  },
  {
    name: "post_drafts",
    jsonColumns: ["marketing_preview_json"],
    nullableJsonColumns: ["marketing_preview_json"],
    idempotencyColumns: ["id", "store_id"],
    deferredColumns: ["revision_of_draft_id"],
  },
  {
    name: "post_publish_attempts",
    jsonColumns: [],
    idempotencyColumns: ["id", "idempotency_key"],
  },
  {
    name: "conversation_sessions",
    jsonColumns: ["selected_candidate_json", "support_metadata_json"],
    nullableJsonColumns: ["selected_candidate_json"],
    idempotencyColumns: ["id", "store_id"],
  },
  {
    name: "conversation_messages",
    jsonColumns: [],
    idempotencyColumns: ["id", "client_event_id"],
  },
  {
    name: "conversation_slot_values",
    jsonColumns: [],
    idempotencyColumns: ["id", "slot_key"],
  },
  {
    name: "conversation_events",
    jsonColumns: ["public_response_json", "redacted_payload_json"],
    idempotencyColumns: ["id", "client_event_id"],
  },
  {
    name: "reviews",
    jsonColumns: [],
    idempotencyColumns: ["id", "raw_review_id"],
  },
  {
    name: "review_replies",
    jsonColumns: [],
    idempotencyColumns: ["id", "review_id"],
  },
  {
    name: "job_runs",
    jsonColumns: [],
    idempotencyColumns: ["id", "idempotency_key"],
  },
  {
    name: "audit_logs",
    jsonColumns: ["redacted_payload_json"],
    idempotencyColumns: ["id", "idempotency_key"],
  },
] satisfies readonly TableSpec[]

export function tableSpecFor(tableName: RequiredTableName): TableSpec {
  const spec = sqliteToPostgresTableSpecs.find(
    (entry) => entry.name === tableName
  )
  if (spec === undefined) {
    throw new MigrationInputError(`Missing SQLite export spec for ${tableName}`)
  }
  return spec
}
