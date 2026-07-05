# Postgres Environment Contract

This project is moving from a local SQLite-first setup toward a Postgres-backed
runtime. Application code must read database configuration from environment
variables only; credentials must not be committed to source, docs, tests, or
examples.

## Required Variables

| Variable              | Required value                                                                        | Secret handling                                                                               |
| --------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `DATABASE_PROVIDER`   | `postgres` for production-like deployments; `sqlite` only for local/dev/test fallback | Non-secret provider selector. Supported values are `sqlite` and `postgres`, not vendor names. |
| `DATABASE_URL`        | `[pooled-postgres-url]`                                                               | Secret. Use the pooled application connection URL.                                            |
| `DATABASE_URL_DIRECT` | `[direct-postgres-url]`                                                               | Secret. Use only for migrations, backups, restore jobs, replication, and admin tasks.         |
| `DATABASE_POOL_MAX`   | `[max-application-pool-connections]`                                                  | Non-secret numeric pool limit. Tune per environment and provider limits.                      |

Do not paste real database URLs into `.env.example`, markdown, source comments,
tests, logs, screenshots, or issue descriptions. If a value is needed in
documentation, use bracketed placeholders like `[pooled-postgres-url]`.

## Environment Behavior

Local development:

- Developers may keep using the existing SQLite local development fallback while
  Postgres development and staging remain in transition.
- When `DATABASE_PROVIDER` is unset, empty, or `sqlite` outside production-like
  environments, the app uses local SQLite. `GLOCALX_DB_PATH` may override the
  default `.glocalx/dev.db` path.
- When testing Postgres locally, set `DATABASE_PROVIDER`, `DATABASE_URL`,
  `DATABASE_URL_DIRECT`, and `DATABASE_POOL_MAX` in a private `.env` file or in
  the local shell session.
- Use a non-production database for local work. Never reuse staging or
  production credentials on a developer machine.

Production-like deployments:

- Any runtime with `VERCEL=1`, `VERCEL_ENV=preview`, or
  `VERCEL_ENV=production` is production-like for database configuration.
- Production-like deployments must set `DATABASE_PROVIDER=postgres`,
  `DATABASE_URL=[pooled-postgres-url]`, and
  `DATABASE_URL_DIRECT=[direct-postgres-url]`.
- Missing pooled runtime URL fails with `DATABASE_URL_REQUIRED`; the app must
  not resolve SQLite or write durable state to `/tmp`.
- Explicit `DATABASE_PROVIDER=sqlite` fails with a typed configuration error
  before SQLite opens.
- `DATABASE_URL_DIRECT` is validated as a release and operations safety gate in
  production-like environments. Application request handlers still use the
  pooled `DATABASE_URL`.

Staging and preview:

- Vercel preview deployments should receive database variables through the
  deployment environment, not through committed files.
- `DATABASE_URL` must point at the pooled connection endpoint for web traffic.
- `DATABASE_URL_DIRECT` must be configured for migration or administrative
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

`.env.example` includes local SQLite defaults plus bracketed Postgres URL
placeholders. Keep real database URLs in `.env.local`, the local shell, or the
deployment secret manager only.
