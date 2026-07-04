# Postgres Environment Contract

This project is moving from a local SQLite-first setup toward a Postgres-backed
runtime. Application code must read database configuration from environment
variables only; credentials must not be committed to source, docs, tests, or
examples.

## Required Variables

| Variable              | Required value                                                               | Secret handling                                                                       |
| --------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `DATABASE_PROVIDER`   | `[postgres-provider]`, for example the selected managed Postgres vendor name | Non-secret label only.                                                                |
| `DATABASE_URL`        | `[pooled-postgres-url]`                                                      | Secret. Use the pooled application connection URL.                                    |
| `DATABASE_URL_DIRECT` | `[direct-postgres-url]`                                                      | Secret. Use only for migrations, backups, restore jobs, replication, and admin tasks. |
| `DATABASE_POOL_MAX`   | `[max-application-pool-connections]`                                         | Non-secret numeric pool limit. Tune per environment and provider limits.              |

Do not paste real database URLs into `.env.example`, markdown, source comments,
tests, logs, screenshots, or issue descriptions. If a value is needed in
documentation, use bracketed placeholders like `[pooled-postgres-url]`.

## Environment Behavior

Local development:

- Developers may keep using the existing local development flow until the
  Postgres adapter lands.
- When testing Postgres locally, set `DATABASE_PROVIDER`, `DATABASE_URL`,
  `DATABASE_URL_DIRECT`, and `DATABASE_POOL_MAX` in a private `.env` file or in
  the local shell session.
- Use a non-production database for local work. Never reuse staging or
  production credentials on a developer machine.

Staging and preview:

- Vercel preview deployments should receive database variables through the
  deployment environment, not through committed files.
- `DATABASE_URL` must point at the pooled connection endpoint for web traffic.
- `DATABASE_URL_DIRECT` may be configured for migration or administrative
  workflows, but application request handlers should not use it.
- Set `DATABASE_POOL_MAX` conservatively because preview deployments can scale
  horizontally and exhaust provider connection limits.

Production:

- Production must use provider-managed secrets for both database URLs.
- Runtime application traffic must use `DATABASE_URL`.
- Migration, backup, restore, replication, long-running analytics, and admin
  tasks must use `DATABASE_URL_DIRECT`.
- Rotate credentials through the provider and deployment secret manager. Do not
  rotate by changing committed files.

## Pooled and Direct Connections

Use the pooled URL for normal application and web traffic. Managed Postgres
poolers are designed to absorb serverless and horizontally scaled application
connection churn.

Use the direct URL for tasks that require a persistent session or direct
database access, including migrations, backup and restore, replication,
long-running analytics, and administrative jobs.

Do not rely on session-level database features through transaction pooling.
Provider documentation for managed Postgres poolers calls out restrictions
around persistent session state and prepared statements, so application code
should keep pooled queries stateless.

## `.env.example` Status

`.env.example` changes are deferred for this task. The main checkout currently
has dirty `.env.example` WIP that must be preserved, so this task records the
required database contract in docs only and leaves the env template for a later
explicit merge.
