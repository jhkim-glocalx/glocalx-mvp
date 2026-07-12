# Postgres Backup, Restore, Rollback, And Observability Runbook

This runbook covers operational readiness for the v2 managed Postgres rollout.
It applies to staging and production planning, but restore drills must run only
against non-production databases. Do not switch production traffic, modify
production secrets, or run live side-effecting integrations from this runbook.

Backups are not fully ready until a non-production restore drill has been
exercised and recorded in `.omo/evidence/`. A configured provider backup policy
without a verified restore is an unproven recovery plan.

## URL Roles

Use the same connection split as the staging cutover rehearsal:

| Workflow                                                                                               | URL role            | Reason                                                                                                        |
| ------------------------------------------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------- |
| App runtime, preview/staging smoke checks, Vercel serverless traffic                                   | `DATABASE_URL`      | Pooled runtime URL for web traffic.                                                                           |
| `pg_dump`, `pg_restore`, `psql`, migrations, schema verification, long analytics, provider admin tasks | Direct URL variable | Use `DATABASE_URL_DIRECT`, Vercel-managed Neon `DATABASE_URL_UNPOOLED`, or legacy `POSTGRES_URL_NON_POOLING`. |

Do not use pooled transaction-pooler URLs for dump, restore, migration, schema
verification, replication, or admin sessions. Do not use direct URLs for normal
application request traffic.

Production-like deployments (`VERCEL=1`, `VERCEL_ENV=preview`, or
`VERCEL_ENV=production`) validate both URL roles at startup. The direct URL is a
release and operations safety requirement; request handlers continue to use the
pooled `DATABASE_URL`. The code checks direct URL variables in this order:
`DATABASE_URL_DIRECT`, `DATABASE_URL_UNPOOLED`, then
`POSTGRES_URL_NON_POOLING`.

## Backup Policy

| Environment     | Frequency                                                                                                                                                     | Owner                                     | Required evidence                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staging/preview | At least daily provider-managed backup or branch snapshot while cutover testing is active; ad hoc SQL dump before destructive rehearsals.                     | Engineering owner for the cutover branch. | Restore drill evidence for the current schema family, dump path checksum, and `npm run db:pg:verify` output against the restored target.                |
| Production      | Provider-managed continuous backup/PITR if available, plus daily retained backups; ad hoc dump before production cutover and before any risky data migration. | CTO or delegated production operator.     | Provider backup policy screenshot or export in a private ticket, restore drill evidence from a non-production clone, and owner approval before cutover. |

Retention should match the provider plan and business recovery objective. Until a
formal recovery objective is approved, keep at least 7 daily restore points for
staging and at least 14 daily restore points for production-capable data.

## Non-Production Restore Drill

Run the drill from a clean worktree on a non-production branch. Use a disposable
managed database or local Docker Postgres as the restore target. Never restore
over staging or production in place.

1. Confirm the target is not production:

   ```bash
   git status --short --branch
   git rev-parse HEAD
   test "${VERCEL_ENV:-preview}" != "production"
   ```

2. Confirm URL presence without printing secret values:

   ```bash
   node -e "console.log(`DATABASE_URL=${process.env.DATABASE_URL ? 'SET' : 'MISSING'}`); console.log(`direct=${process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING ? 'SET' : 'MISSING'}`)"
   ```

   If both URLs are missing and Docker is unavailable, stop and record:

   ```text
   BLOCKED_BY_ENV: no non-production DATABASE_URL/direct URL variable and Docker daemon unavailable; backup dump, restore, schema verify, and app runtime checks were not run.
   ```

3. Create a custom-format dump from the source non-production direct URL:

   ```bash
   pg_dump \
     --format=custom \
     --no-owner \
     --no-acl \
     --file .omo/evidence/task-16-nonprod.dump \
     "$DATABASE_URL_DIRECT"
   shasum -a 256 .omo/evidence/task-16-nonprod.dump
   ```

4. Restore into a disposable non-production target. Use a separate direct URL,
   not the source database:

   ```bash
   export RESTORE_DATABASE_URL_DIRECT=[direct-non-production-restore-url]
   pg_restore \
     --clean \
     --if-exists \
     --no-owner \
     --no-acl \
     --dbname "$RESTORE_DATABASE_URL_DIRECT" \
     .omo/evidence/task-16-nonprod.dump
   ```

   For a plain SQL dump, use `psql "$RESTORE_DATABASE_URL_DIRECT" --file ...`
   instead of `pg_restore`.

5. Verify the restored schema through the direct restore URL:

   ```bash
   VERCEL_ENV=preview \
   DATABASE_PROVIDER=postgres \
   DATABASE_URL_DIRECT="$RESTORE_DATABASE_URL_DIRECT" \
   npm run db:pg:verify
   ```

6. Verify app runtime with the pooled URL, not the direct restore URL:

   ```bash
   VERCEL_ENV=preview \
   DATABASE_PROVIDER=postgres \
   DATABASE_URL=[pooled-non-production-url] \
   DATABASE_URL_DIRECT="$RESTORE_DATABASE_URL_DIRECT" \
   APP_INTEGRATION_MODE=stub \
   npm run test -- src/server/db
   ```

Record command statuses, dump checksum, restored target description, and any
blockers in `.omo/evidence/task-16-v1-to-v2-postgres-architecture.txt`. Redact
all connection strings, passwords, tokens, cookies, and provider identifiers.

### Local Docker Fallback

If no managed non-production restore target is available but Docker is running,
use the local compose database as a disposable target:

```bash
docker compose -f docker-compose.postgres.yml up -d postgres
export DATABASE_URL_DIRECT=[local-docker-direct-url-from-docker-compose]
export DATABASE_URL=[local-docker-pooled-or-direct-runtime-url-from-docker-compose]
VERCEL_ENV=preview DATABASE_PROVIDER=postgres npm run db:pg:migrate
VERCEL_ENV=preview DATABASE_PROVIDER=postgres npm run db:pg:seed
pg_dump --format=custom --no-owner --no-acl --file .omo/evidence/task-16-local.dump "$DATABASE_URL_DIRECT"
createdb "[local-docker-restore-direct-url]"
pg_restore --clean --if-exists --no-owner --no-acl --dbname "[local-docker-restore-direct-url]" .omo/evidence/task-16-local.dump
DATABASE_URL_DIRECT=[local-docker-restore-direct-url] VERCEL_ENV=preview DATABASE_PROVIDER=postgres npm run db:pg:verify
DATABASE_URL=[local-docker-pooled-or-direct-runtime-url-from-docker-compose] DATABASE_URL_DIRECT=[local-docker-restore-direct-url] VERCEL_ENV=preview DATABASE_PROVIDER=postgres npm run test -- src/server/db
```

This fallback proves the dump/restore mechanics and schema verification path. It
does not prove managed-provider PITR, retention, networking, or Vercel secret
configuration.

## Rollback Checklist

Rollback to a prior Vercel deployment is valid only while database changes remain
backward compatible with the prior app version.

Before rollback:

- Identify the last known-good Vercel deployment for the same environment.
- Confirm the current deployment uses non-production credentials unless an
  approved production incident commander owns the action.
- Confirm no destructive schema migration has run since the last known-good
  deployment.
- Confirm the prior app version can read the current database schema.
- Confirm any new nullable columns, indexes, or tables are expand-only and do
  not require data deletion to roll back application code.
- Preserve current logs, deployment ID, commit hash, and database migration
  state before changing traffic.

Rollback action:

```bash
vercel rollback [deployment-url-or-id]
```

Post-rollback checks:

- App runtime uses pooled `DATABASE_URL`.
- Migration/admin commands still use the configured direct URL variable.
- Owner login, onboarding read/write, post draft read/write, and publish-attempt
  history still work in stub mode.
- No restore or schema mutation is attempted as part of application rollback.

If a database migration is not backward compatible, stop. Roll forward with a
reviewed compatibility migration or a separate data recovery plan. Do not drop
columns, truncate tables, rewrite historical rows, or restore over production as
a shortcut.

## Migration Safety

Use expand-only migrations until production cutover is stable:

- Add nullable columns before code depends on them.
- Add new tables and indexes without removing existing read paths.
- Backfill in separate bounded jobs with verification.
- Deploy code that can tolerate old and new shapes during the transition.

Destructive schema changes require a separate follow-up plan with a backup,
restore drill, owner approval, and production rollback analysis. Examples:
`DROP TABLE`, `DROP COLUMN`, incompatible type changes, bulk deletes, table
rewrites, and removing SQLite compatibility before production has stabilized.

## Observability And Security Checks

Run these checks during staging rehearsals and after production cutover. Prefer
provider dashboards for continuous monitoring and use direct connections for
administrative SQL.

Connection pool monitoring:

- Watch provider connection count, pool saturation, wait time, and connection
  errors for the pooled endpoint.
- Compare `DATABASE_POOL_MAX` with provider limits and Vercel concurrency.
- Investigate spikes in `too many connections`, connection timeout, or pooler
  transaction errors.

Slow query review:

- Use provider query insights or `pg_stat_statements` when enabled.
- Review slow route-adjacent queries after onboarding, conversation, draft, and
  publish flows.
- Keep query review read-only. Do not run ad hoc updates during monitoring.

Audit log review:

```sql
SELECT created_at, action, store_id, actor_user_id, idempotency_key
FROM audit_logs
ORDER BY created_at DESC
LIMIT 50;
```

The `audit_logs.redacted_payload_json` column is for redacted operational
context only. Do not paste raw payloads into evidence, issues, screenshots, or
chat. Investigate unexpected actions, repeated idempotency keys, missing
`actor_user_id` for owner actions, and audit gaps around publish attempts.

Token and security checks:

- Confirm `APP_INTEGRATION_MODE=stub` for rehearsals unless a live-integration
  plan is explicitly approved.
- Confirm production OAuth, Naver, Google Business Profile, OpenAI, Kakao, and
  token-encryption secrets are scoped only to approved environments.
- Rotate database credentials through the provider and Vercel secret manager,
  never through committed files.
- Scan changed docs and evidence for Postgres URL schemes, OpenAI key prefixes,
  OAuth client secrets, cookies, and raw JWT-like values before commit.
- Keep `TOKEN_ENCRYPTION_KEY` present for production token storage and absent
  from docs, logs, screenshots, and evidence.

## No-Go Conditions

Do not promote or declare backup readiness if any condition is true:

- No non-production restore drill has been run and recorded.
- The only available database URL is production.
- A production-like deployment would start without `DATABASE_PROVIDER=postgres`,
  pooled `DATABASE_URL`, or a configured direct URL variable.
- The direct URL variable is missing for migration, backup, restore, or admin work.
- Dump/restore uses the pooled URL.
- Schema verification fails on the restored target.
- App runtime verification uses a direct URL instead of pooled `DATABASE_URL`.
- Evidence contains unredacted secrets or provider identifiers.
- A rollback would require destructive database changes.

## References

- `docs/deployment/postgres-staging-cutover-rehearsal.md`
- `docs/architecture/postgres-environment.md`
- `docs/architecture/v2-postgres-architecture.md`
- PostgreSQL Backup and Restore: https://www.postgresql.org/docs/current/backup.html
- Neon connection pooling: https://neon.com/docs/connect/connection-pooling
