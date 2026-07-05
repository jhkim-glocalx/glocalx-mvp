# Staging Postgres Cutover Rehearsal Runbook

This runbook is for the v2 Postgres cutover rehearsal in Vercel preview or
staging only. Do not switch production traffic while running these steps.

Use a non-production managed Postgres database. Record every command outcome in
`.omo/evidence/task-15-v1-to-v2-postgres-architecture.txt` and redact all
database URLs, tokens, passwords, cookies, and provider console identifiers.

## Environment Gate

Vercel environment variables are scoped to project, team, and deployment
environment. Changes apply only to new deployments, so set variables before
creating the rehearsal preview deployment.

Preview or staging deployment requirements:

| Variable                     | Required preview value          | Role                                                                      |
| ---------------------------- | ------------------------------- | ------------------------------------------------------------------------- |
| `VERCEL_ENV`                 | `preview`                       | Confirms the rehearsal is not production.                                 |
| `DATABASE_PROVIDER`          | `postgres`                      | Selects the Postgres runtime boundary.                                    |
| `DATABASE_URL`               | `[pooled-preview-postgres-url]` | Pooled URL for app runtime, route handlers, dev server, build, and e2e.   |
| `DATABASE_URL_DIRECT`        | `[direct-preview-postgres-url]` | Direct URL for migrations, schema checks, seed, SQLite import, and admin. |
| `APP_INTEGRATION_MODE`       | `stub`                          | Keeps external integrations deterministic and side-effect free.           |
| `NEXT_PUBLIC_APP_NAME`       | `GlocalX`                       | Existing public app placeholder.                                          |
| `ENABLE_ADMIN_DEBUG`         | `false`                         | Existing non-secret debug placeholder.                                    |
| `RUN_LIVE_INTEGRATION_TESTS` | `0`                             | Keeps live integration tests disabled during rehearsal.                   |

Do not add production OAuth, Naver, Google Business Profile, OpenAI, or Kakao
secrets for this rehearsal unless a separate live-integration test plan is
approved. If a required app variable needs a placeholder for build-time
validation, use the placeholder values from `.env.example`, keep
`APP_INTEGRATION_MODE=stub`, and do not grant live side effects.

Production gate language:

- Vercel preview and production deployments must never rely on SQLite or a
  default `/tmp` database path.
- `VERCEL_ENV=production` must not be changed by this rehearsal.
- Production may use `DATABASE_PROVIDER=postgres` only after staging evidence
  proves schema migration, demo seed, SQLite export/import/reconcile, app
  runtime, targeted tests, full verification, and abort behavior.
- Production must use provider-managed production secrets:
  `DATABASE_URL=[pooled-production-postgres-url]` for runtime and
  `DATABASE_URL_DIRECT=[direct-production-postgres-url]` for migrations,
  backup/restore, long analytics, replication, and admin tasks.
- Production promotion requires an explicit release gate from the owner or CTO,
  a reviewed backup/rollback plan, a fresh production deployment, and a no-go
  check that no preview credentials are reused in production.

If no non-production Postgres URL is available, stop before any live database
write and record:

```text
BLOCKED_BY_ENV: no non-production Postgres DATABASE_URL and DATABASE_URL_DIRECT
were provided; live migration, seed, import, runtime, and e2e steps were not run.
```

## Pooled Versus Direct URL Rules

Use the pooled URL for web/serverless app traffic. Use the direct URL for
schema, import, backup, restore, replication, long analytics, and admin tasks.
Production-like app startup also validates that `DATABASE_URL_DIRECT` is present
so operational workflows cannot ship unconfigured, but request handlers continue
to use pooled `DATABASE_URL`.

| Step or command                                | URL role        | Notes                                                         |
| ---------------------------------------------- | --------------- | ------------------------------------------------------------- |
| `npm run build`                                | pooled          | Build-time app code must resolve the runtime Postgres URL.    |
| `npm run dev -- --hostname ...`                | pooled          | Local staging-like app runtime uses `DATABASE_URL`.           |
| `npm run e2e:postgres`                         | pooled          | Playwright app server must receive `DATABASE_URL`.            |
| `npm run db:pg:migrate`                        | direct          | Uses `DATABASE_URL_DIRECT` through migration tooling.         |
| `npm run db:pg:seed`                           | direct          | Runs migrations first, then deterministic demo seed.          |
| `npm run db:pg:verify`                         | direct          | Verifies migration source and durable tables.                 |
| `npm run db:migrate:sqlite-to-pg -- --dry-run` | neither live DB | Exports SQLite and reconciles the local export.               |
| `npm run db:migrate:sqlite-to-pg -- --import`  | direct          | Imports to Postgres and reconciles via `DATABASE_URL_DIRECT`. |
| `pg_dump`, `pg_restore`, provider admin        | direct          | Out of scope for this rehearsal unless explicitly approved.   |

## Rehearsal Procedure

Run from a clean branch checkout in preview/staging mode.

1. Confirm scope and branch:

   ```bash
   git status --short --branch
   git rev-parse HEAD
   ```

   Abort if the branch is not the intended feature branch or if unrelated dirty
   files would be overwritten.

2. Configure preview/staging environment variables in Vercel or the local shell.
   Do not print secret values. For local rehearsal commands, export only the
   placeholders and secrets required for that process:

   ```bash
   export VERCEL_ENV=preview
   export DATABASE_PROVIDER=postgres
   export DATABASE_URL=[pooled-preview-postgres-url]
   export DATABASE_URL_DIRECT=[direct-preview-postgres-url]
   export APP_INTEGRATION_MODE=stub
   export NEXT_PUBLIC_APP_NAME=GlocalX
   export ENABLE_ADMIN_DEBUG=false
   export RUN_LIVE_INTEGRATION_TESTS=0
   ```

3. Prove the controlled missing-runtime-URL failure before using live URLs:

   ```bash
   VERCEL_ENV=preview DATABASE_PROVIDER=postgres APP_INTEGRATION_MODE=stub \
     node --input-type=module -e "import('./src/server/db/config.ts').then(({ resolveDatabaseConfig }) => resolveDatabaseConfig(process.env))"
   ```

   Expected result: non-zero exit with:

   ```text
   DATABASE_URL_REQUIRED: DATABASE_URL is required for Postgres runtime mode
   ```

4. Run safe static and local checks that do not need a live Postgres database:

   ```bash
   npm run typecheck
   npm run lint
   npm run test -- src/server/db
   npm run format:check
   ```

5. Export and reconcile the current SQLite data without touching Postgres:

   ```bash
   npm run db:migrate:sqlite-to-pg -- \
     --dry-run \
     --export .omo/evidence/task-15-sqlite-to-postgres-export.json
   ```

   Expected result: `Dry-run reconciliation passed` and an ignored export file
   under `.omo/evidence/`.

6. Run schema migration against the non-production Postgres direct URL:

   ```bash
   VERCEL_ENV=preview DATABASE_PROVIDER=postgres \
     DATABASE_URL_DIRECT=[direct-preview-postgres-url] \
     npm run db:pg:migrate
   ```

   Abort if this command would target production, if the provider console shows
   a production branch/project/database, or if any migration checksum differs.

7. Seed deterministic demo data through the direct URL:

   ```bash
   VERCEL_ENV=preview DATABASE_PROVIDER=postgres \
     DATABASE_URL_DIRECT=[direct-preview-postgres-url] \
     npm run db:pg:seed
   ```

8. Import the SQLite export into the non-production Postgres target and reconcile:

   ```bash
   VERCEL_ENV=preview DATABASE_PROVIDER=postgres \
     DATABASE_URL_DIRECT=[direct-preview-postgres-url] \
     npm run db:migrate:sqlite-to-pg -- \
       --import \
       --input .omo/evidence/task-15-sqlite-to-postgres-export.json \
       --confirm-non-production
   ```

   Add `--reset-target` only when the target is a disposable preview database
   and the reset has been explicitly approved for that database.

9. Verify Postgres schema through the direct URL:

   ```bash
   VERCEL_ENV=preview DATABASE_PROVIDER=postgres \
     DATABASE_URL_DIRECT=[direct-preview-postgres-url] \
     npm run db:pg:verify
   ```

10. Build and run the app in Postgres runtime mode through the pooled URL:

    ```bash
    VERCEL_ENV=preview DATABASE_PROVIDER=postgres \
      DATABASE_URL=[pooled-preview-postgres-url] \
      DATABASE_URL_DIRECT=[direct-preview-postgres-url] \
      APP_INTEGRATION_MODE=stub \
      npm run build

    VERCEL_ENV=preview DATABASE_PROVIDER=postgres \
      DATABASE_URL=[pooled-preview-postgres-url] \
      DATABASE_URL_DIRECT=[direct-preview-postgres-url] \
      APP_INTEGRATION_MODE=stub \
      npm run dev -- --hostname 127.0.0.1 --port 3000
    ```

11. Run targeted and full verification against the pooled runtime URL:

    ```bash
    npm run test -- src/server/db

    VERCEL_ENV=preview DATABASE_PROVIDER=postgres \
      DATABASE_URL=[pooled-preview-postgres-url] \
      DATABASE_URL_DIRECT=[direct-preview-postgres-url] \
      APP_INTEGRATION_MODE=stub \
      PLAYWRIGHT_WEB_SERVER_COMMAND="VERCEL_ENV=preview DATABASE_PROVIDER=postgres DATABASE_URL=[pooled-preview-postgres-url] DATABASE_URL_DIRECT=[direct-preview-postgres-url] APP_INTEGRATION_MODE=stub npm run dev -- --hostname 127.0.0.1 --port 3000" \
      npm run e2e:postgres

    npm run typecheck
    npm run lint
    npm run test
    npm run format:check
    ```

    If browser verification is not possible in the local environment, record the
    exact failure, trace path if produced, and the preview deployment URL that
    should be used for manual verification.

## Abort Conditions

Abort the rehearsal and keep production unchanged if any of these are true:

- `VERCEL_ENV` is `production`, unset in a deployed production context, or points
  to a production deployment.
- `DATABASE_URL` or `DATABASE_URL_DIRECT` belongs to a production database.
- The only available database URL is production.
- `DATABASE_URL` is direct-only or `DATABASE_URL_DIRECT` is a pooled pooler URL.
- Migration checksum validation fails.
- SQLite export/import reconciliation reports mismatches.
- Postgres schema verification reports missing tables or migration metadata.
- App build, targeted DB tests, or e2e runtime checks fail for a new Postgres
  reason.
- Secret values appear in terminal output, screenshots, logs, docs, or evidence.

Abort means stop the rehearsal, leave production variables unchanged, preserve
the failing evidence, and continue using the existing non-production deployment
until the issue is fixed and the full rehearsal is rerun.

## Evidence Capture

Record the following in `.omo/evidence/task-15-v1-to-v2-postgres-architecture.txt`:

- Branch, commit, and worktree status before and after.
- Whether the Todo 15 plan file was present locally.
- Exact commands run, with pass, fail, or `BLOCKED_BY_ENV` status.
- The controlled missing-`DATABASE_URL` failure output.
- SQLite dry-run export path and reconciliation summary.
- Live Postgres migration, seed, import, verify, build, run, and e2e outcomes,
  or the exact `BLOCKED_BY_ENV` reason when no non-production URL exists.
- Changed files and final commit hash.

Keep evidence concise. Include command summaries, not secrets or raw environment
dumps.
