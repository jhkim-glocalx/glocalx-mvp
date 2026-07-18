# Migration runbook — one database, two apps

With owner-app and admin deploying independently against one Neon
Postgres, `db:pg:migrate` runs **exactly once per schema change**, by a
human, before the schema-bearing PR merges. Neither app migrates at
runtime (SQLite apply-on-open is the local-dev path only).

## The named step, in order

1. Write the migration as a new ordered SQL file in **both** dialects:
   `packages/db/src/migrations/NNNN_name.sql` (SQLite) and
   `packages/db/src/postgres/migrations/NNNN_name.sql`. Register the
   SQLite file in `migrationPaths` (`packages/db/src/sqlite.ts`) and any
   new tables in `operationalTableNames`/`requiredTableNames` so
   `db:pg:verify` enforces them.
2. Keep it **expand-contract**: additive changes (new tables, nullable
   columns) land freely. Renames, drops, and new constraints on existing
   columns ship only after both apps run code that no longer needs the
   old shape — one release later.
3. CI proves the migration applies cleanly against a throwaway Postgres
   (`db:pg:migrate` + `db:pg:verify` in `.github/workflows/ci.yml`).
4. **Before merging** the PR: the PM/founder runs, from a shell with the
   staging/production direct URL —

   ```bash
   DATABASE_URL_DIRECT=postgres://... npm run db:pg:migrate
   DATABASE_URL_DIRECT=postgres://... npm run db:pg:verify
   ```

5. Merge. Both Vercel projects deploy against the already-migrated
   schema; the not-yet-redeployed app keeps serving through the window
   because step 2 guaranteed the old shape still works.

## Local Postgres for development

```bash
docker compose -f docker-compose.postgres.yml up -d
DATABASE_PROVIDER=postgres \
DATABASE_URL=postgres://glocalx:glocalx@127.0.0.1:54329/glocalx \
DATABASE_URL_DIRECT=postgres://glocalx:glocalx@127.0.0.1:54329/glocalx \
npm run db:pg:migrate && npm run db:pg:verify
```

Production resets are blocked by the target-bound confirmation guard in
`packages/db/src/postgres/reset-guard.ts`.

## Applied migration log

The `glocalx_schema_migrations` table (version, checksum, `applied_at`) is
the source of truth for what has run against a given database. This table
is the human-readable trail — add a row each time step 4 is run against a
real (non-throwaway) database.

| Date       | Migration(s) applied                                                                     | Target                          | Verify result                                         | Run by  |
| ---------- | ---------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------- | ------- |
| 2026-07-18 | `0007_cs_chat_activity` (`0002`–`0006` also applied — the DB previously had only `0001`) | production shared Neon Postgres | `Verified Postgres schema with 26 application tables` | founder |
