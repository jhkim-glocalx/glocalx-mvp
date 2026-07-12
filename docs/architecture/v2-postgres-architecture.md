# ADR: v2 Managed Postgres Architecture

Status: Accepted for the v2 architecture plan

Date: 2026-07-04

## Decision

GlocalX v2 uses managed Postgres as the production database architecture. Neon is
the first implementation target for this plan. Supabase is comparative only and
is not implemented in this plan unless the CTO later changes the provider
decision.

SQLite remains a temporary local/dev/test fallback until Postgres development
and staging are proven. It is not allowed in production-like deployments and
should not become the v2 production architecture.

Runtime and operational connection strings have separate roles:

- `DATABASE_URL` is the pooled app/runtime URL. Application requests, serverless
  route handlers, and normal web traffic use this URL.
- `DATABASE_URL_DIRECT` is the direct URL for migrations, schema management,
  backups, restores, long analytics, logical replication, and administrative
  tasks when setting variables manually. Vercel-managed Neon may provide this
  same direct role as `DATABASE_URL_UNPOOLED`; legacy Neon/Vercel environments
  may provide `POSTGRES_URL_NON_POOLING`.
- No provider secrets belong in docs, ADRs, screenshots, logs, or examples.

## Context

The v1 app uses SQLite for local durability. That is useful for fast development,
but it is the wrong long-term production boundary for multi-environment web
traffic, managed backups, operational access, and provider-hosted deployment.

Managed Postgres gives v2 a standard relational database with ACID transactions,
foreign keys, complex queries, backup workflows, and a broad operational tool
surface. PostgreSQL documents SQL dumps, filesystem-level backups, and
continuous archiving as backup approaches, and it uses multiversion concurrency
control so reads and writes avoid blocking each other in the common case.

Neon is the first target because it fits the expected serverless runtime model:
Vercel can provision Postgres providers including Neon through Marketplace
storage and inject credentials as environment variables, and Neon documents
PgBouncer-backed pooling for web and serverless app traffic.

Supabase remains a valid comparison point for Postgres-hosted products, but this
plan does not implement Supabase-specific configuration, clients, migrations, or
runtime assumptions.

## Consequences

- Schema and persistence work should target Postgres semantics first, not
  SQLite-specific behavior.
- Local development can keep SQLite only as a temporary fallback while Postgres
  dev and staging are stabilized.
- Any Vercel runtime (`VERCEL=1`) and any `VERCEL_ENV=preview` or
  `VERCEL_ENV=production` runtime must resolve `DATABASE_PROVIDER=postgres` with
  `DATABASE_URL` and one configured direct URL variable; it must not fall back
  to SQLite or `/tmp`.
- Application code must use the pooled `DATABASE_URL` for normal runtime
  database access.
- Migration, backup, restore, replication, and admin workflows must use the
  configured direct URL variable.
- Provider-specific setup should start with Neon. Supabase-specific docs or code
  require a later CTO decision.
- Operational evidence should show which URL role was used, but must never
  expose credential values.

## Guardrails

- Do not paste database connection strings into docs, tickets, screenshots, or
  evidence files.
- Do not add provider secrets to committed files.
- Do not use `DATABASE_PROVIDER` as a vendor label. It is the runtime selector
  and supports only `sqlite` or `postgres`.
- Do not allow SQLite in Vercel preview or production. Missing production-like
  Postgres configuration must fail before a SQLite database opens.
- Do not use the pooled URL for schema migrations, dump/restore, long analytics,
  logical replication, or admin tasks that need a persistent session.
- Do not use transaction pooling features that require persistent sessions.
  Neon documents limitations for session-level `SET` and `RESET`,
  `LISTEN` and `NOTIFY`, SQL `PREPARE` and `DEALLOCATE`, and temporary tables
  that require a persistent session.
- Do not implement Supabase-specific behavior in this plan.
- Treat any local SQLite support as transitional. It exists to keep development
  unblocked, not to define production architecture.

## Rollback And Cutover Posture

Cutover should be staged:

1. Prove Postgres locally or in a dedicated development database.
2. Run migrations through the configured direct URL variable.
3. Run the app against the pooled `DATABASE_URL` in staging.
4. Validate owner flows, onboarding writes, post draft writes, publish attempts,
   and rollback paths against staging data.
5. Promote only after staging evidence confirms runtime queries use the pooled
   URL and operational commands use the direct URL.

Rollback should preserve a known-good SQLite fallback only for local/dev/test
during the transition window. The fallback sunsets for deployable runtimes now:
Vercel preview and production must require Postgres. After Postgres staging and
production are proven, SQLite fallback should be removed or narrowed to tests and
offline fixtures so production behavior has one database model.

## References

- PostgreSQL backup documentation:
  https://www.postgresql.org/docs/current/backup.html
- PostgreSQL MVCC documentation:
  https://www.postgresql.org/docs/current/mvcc-intro.html
- Neon connection pooling documentation:
  https://neon.com/docs/connect/connection-pooling
- Vercel storage documentation:
  https://vercel.com/docs/storage
