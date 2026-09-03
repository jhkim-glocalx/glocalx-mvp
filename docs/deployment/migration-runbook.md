# Migration runbook — one database, two apps

> **한국어:** [migration-runbook.ko.md](./migration-runbook.ko.md)

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

| Date       | Migration(s) applied                                                                                                                                                                                                                                                                                                                                                                                                                        | Target                          | Verify result                                                                             | Run by  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------- | ------- |
| 2026-07-18 | `0007_cs_chat_activity` (`0002`–`0006` also applied — the DB previously had only `0001`)                                                                                                                                                                                                                                                                                                                                                    | production shared Neon Postgres | `Verified Postgres schema with 26 application tables`                                     | founder |
| 2026-07-20 | `0008_cs_ai_mode` (widens `cs_conversations.mode` to add `ai_draft`; adds `cs_messages.status` + owner-visible partial index; adds `flagged_at`/`flag_reason`) — applied to Neon **before** merging PR #12, which changed live read paths                                                                                                                                                                                                   | production shared Neon Postgres | `Verified Postgres schema with 26 application tables` (columns/index only, no new tables) | founder |
| 2026-07-21 | `0009_campaign_pipeline` (adds `campaign_requests`, `campaign_assets`, `campaign_review_events`, `publish_jobs` — 4 new tables) — applied after PR #16 merged, precedes Phase 3 PR2                                                                                                                                                                                                                                                         | production shared Neon Postgres | `Verified Postgres schema with 30 application tables`                                     | founder |
| 2026-07-22 | `0010_campaign_final_copy` (adds nullable `campaign_requests.final_copy`; SQLite reaches the same state via `ensureColumn` and skips the 0010 slot) — applied to Neon before merging Phase 3 PR3                                                                                                                                                                                                                                            | production shared Neon Postgres | `Verified Postgres schema with 30 application tables` (column only, no new tables)        | founder |
| 2026-07-24 | `0011_store_channel_links` (adds `store_channel_links` — per-store publish channel linkage, one new table) — applied to Neon before merging Phase 3 task 6 (publish panel)                                                                                                                                                                                                                                                                  | production shared Neon Postgres | `Verified Postgres schema with 31 application tables`                                     | founder |
| 2026-07-25 | `0012_org_credentials` (adds `org_credentials` — org-wide publishing credentials, unique per provider, one new table) — applied to Neon before merging Phase 3 task 7                                                                                                                                                                                                                                                                       | production shared Neon Postgres | `Verified Postgres schema with 32 application tables`                                     | founder |
| 2026-07-25 | `0013_campaign_nudge` (adds nullable `campaign_requests.nudged_at`; SQLite reaches the same state via `ensureColumn` and skips the 0013 slot) — applied to Neon before merging Phase 3 task 8                                                                                                                                                                                                                                               | production shared Neon Postgres | `Verified Postgres schema with 32 application tables` (column only, no new tables)        | founder |
| 2026-07-31 | `0014_gbp_access_requests` (adds `gbp_access_requests` — org GBP manager-access tracking, one row per store, one new table) — applied to Neon before merging Phase 4 PR1 (data layer)                                                                                                                                                                                                                                                       | production shared Neon Postgres | `Verified Postgres schema with 33 application tables`                                     | founder |
| 2026-08-05 | `0015_store_gbp_category` (adds nullable `stores.gbp_primary_category_id` + `stores.gbp_primary_category_display_name`; SQLite reaches the same state via `ensureColumn` and skips the 0015 slot) — applied to Neon before merging PR #30 (geocoded live GBP create)                                                                                                                                                                        | production shared Neon Postgres | `33 application tables` (columns only, no new tables)                                     | founder |
| 2026-08-12 | `0016_gbp_verification_state` (adds `gbp_verification_state` + its unique per-store index — per-listing verification state, one new table) — applied to Neon before merging PR #47 (in-app verification state + on-view refresh)                                                                                                                                                                                                            | production shared Neon Postgres | `Verified Postgres schema with 34 application tables`                                     | founder |
| 2026-08-13 | `0017_campaign_gbp_cta` (adds nullable `campaign_requests.gbp_cta_action_type` + `gbp_cta_url` and the `campaign_requests_gbp_cta_pairing` CHECK; SQLite reaches the columns via `ensureColumn`, has no equivalent constraint, and skips the 0017 slot) — applied to Neon before merging PR #52 (operator-set CTA button)                                                                                                                   | production shared Neon Postgres | `34 application tables` (columns + constraint only, no new tables)                        | founder |
| 2026-08-14 | `0018_publish_job_external_url` (adds nullable `publish_jobs.external_url`; SQLite reaches the same state via `ensureColumn` and skips the 0018 slot) — applied to Neon before merging PR #56 (keep a published post's url)                                                                                                                                                                                                                 | production shared Neon Postgres | `34 application tables` (column only, no new tables)                                      | founder |
| 2026-08-14 | `0019_store_channel_link_handles` (adds nullable `store_channel_links.requested_account_handle` + `linked_account_username`; SQLite reaches the same state via `ensureColumn` and skips the 0019 slot) — applied to Neon before merging PR #58 (Instagram connect card)                                                                                                                                                                     | production shared Neon Postgres | `34 application tables` (columns only, no new tables)                                     | founder |
| 2026-08-24 | `0020_gbp_access_adoption_review` (widens `gbp_access_requests_state_check` to add the `adoption_review` state; no column change) — applied to Neon before merging PR #60 (adopt an org-managed listing)                                                                                                                                                                                                                                    | production shared Neon Postgres | `34 application tables` (constraint only, no new tables)                                  | founder |
| 2026-09-04 | `0021_user_deactivation` (adds nullable `users.deactivated_at`; SQLite reaches the column via `ensureColumn` and skips the 0021 slot) — **shipped in PR #82 on 2026-08-26 but the step‑4 migrate was missed**: `session-store.ts` began joining `users` and filtering on `deactivated_at`, so from 2026‑08‑26 every prod Google/Kakao/email signup + login `500`'d on the missing column until it was applied on 2026‑09‑04 (see issue #84) | production shared Neon Postgres | `Verified Postgres schema with 34 application tables and 21 applied migrations`           | founder |

> **2026-09-04 backfill note:** the `0015`–`0021` rows above were reconstructed
> on 2026-09-04 from PR merge history and reconciled against a single
> `db:pg:verify` run that day (`34 application tables and 21 applied
migrations`), because this log lapsed after `0014`. The `glocalx_schema_migrations`
> table remains the source of truth for _what_ ran; for `0016`/`0018`/`0019`/`0020`
> the date shown is the PR merge date and the exact step-4 run time was not
> separately recorded. Keep this table current going forward — a maintained log
> would have caught the `0021` gap before it reached production.
