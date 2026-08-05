# v2 production cutover checklist

> **한국어:** [v2-production-cutover.ko.md](./v2-production-cutover.ko.md)

The go-live checklist for the v2 program (owner app + operator console on
one Postgres). It **composes** the existing deployment runbooks rather than
repeating them — follow the links for the detailed procedures:

- Two Vercel projects & the hostname gotcha: [vercel-two-projects.md](./vercel-two-projects.md)
- Migration order & the `db:pg:verify` gate: [migration-runbook.md](./migration-runbook.md)
- Backup / restore / rollback / observability: [postgres-backup-restore-rollback-observability.md](./postgres-backup-restore-rollback-observability.md)
- Staging cutover rehearsal (do this first): [postgres-staging-cutover-rehearsal.md](./postgres-staging-cutover-rehearsal.md)

## Preconditions

- [ ] Phases 0–5 merged to `main`; CI (lint, typecheck, test, e2e, build)
      green on the merge commit.
- [ ] Staging cutover rehearsal completed on Neon per
      `postgres-staging-cutover-rehearsal.md`, with evidence captured.
- [ ] A browser QA pass on both apps against the Phase 5 demo seed on a
      preview deploy — Queue, Inbox, and Stores render without console or
      network errors (see `docs/v2/ops-runbook.md`).
- [ ] Backup taken immediately before any production migration
      (`postgres-backup-restore-rollback-observability.md` §Backup Policy).

## Projects (decided 2026-07-17 — do not re-derive)

Only **one** Vercel project deploys from this repo. The production alias is
**`https://glocalx-mvp-six.vercel.app`**, _not_ `glocalx-mvp.vercel.app`
(that hostname belongs to the frozen v1 project and 404s on every real v2
route). Full table and the `-six` explanation live in
[vercel-two-projects.md](./vercel-two-projects.md).

| Project                              | Role                                                               | Root dir         |
| ------------------------------------ | ------------------------------------------------------------------ | ---------------- |
| `glocalx-mvp` (admin-10456072s team) | Repo-connected owner app; `main` → prod + PR previews              | `apps/owner-app` |
| `glocalx-admin`                      | Operator console; `main` → prod + PR previews                      | `apps/admin`     |
| `glocalx-mvp-private`                | Git-disconnected; holds the purchased domain; promote deliberately | —                |

## Environment variable matrix

Both projects need the **same** Postgres. Set on **Production + Preview**.
Never commit real values; set them in the Vercel dashboard.

### Both projects

| Variable               | Value / note                                             |
| ---------------------- | -------------------------------------------------------- |
| `DATABASE_PROVIDER`    | `postgres` (required on any Vercel runtime)              |
| `DATABASE_URL`         | Pooled Neon URL (runtime)                                |
| `DATABASE_URL_DIRECT`  | Direct/unpooled Neon URL (migrations & ops only)         |
| `APP_INTEGRATION_MODE` | `stub` today. See the flip caveat below before changing. |

### Owner app (`glocalx-mvp`) — additional

| Variable                                                                       | Value / note                                         |
| ------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `TOKEN_ENCRYPTION_KEY`                                                         | Required. Encrypts owner OAuth tokens at rest.       |
| `POST_MEDIA_SIGNING_KEY`                                                       | Required. Signs media URLs.                          |
| `BLOB_READ_WRITE_TOKEN`, `BLOB_PUBLIC_HOST`                                    | Vercel Blob (campaign media).                        |
| `PUBLIC_APP_URL`                                                               | The `-six` production URL (OAuth redirects, links).  |
| `NEXT_PUBLIC_APP_NAME`                                                         | Display name.                                        |
| **Production-mode only** (all blocked-by-credentials in stub):                 |                                                      |
| `GOOGLE_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI`, `GOOGLE_BUSINESS_ACCOUNT_ID` | GBP + Google login                                   |
| `GOOGLE_ORG_REFRESH_TOKEN`, `GOOGLE_GEOCODING_API_KEY`                         | Live GBP setup: org access token + address geocoding |
| `KAKAO_REST_API_KEY` / `_CLIENT_SECRET` / `_REDIRECT_URI`                      | Kakao login                                          |
| `NAVER_CLIENT_ID` / `_SECRET`                                                  | Naver business extraction                            |
| `OPENAI_API_KEY` (+ `OPENAI_*_MODEL`)                                          | Onboarding / marketing / image AI                    |
| `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`                                  | Instagram publishing                                 |
| Org publishing credential (`org_credentials`, `google_org`)                    | GBP publishes from the org account, not owner tokens |

### Admin (`glocalx-admin`) — additional

Admin uses DB-backed sessions and needs no auth secret env. Seed operators
from a shell (`seed:admin`, see the runbook). No integration keys — the
console never calls Google/Instagram directly.

## Migration order (non-negotiable)

Neither app migrates at runtime. `db:pg:migrate` runs **exactly once per
schema change**, by the PM/founder over `DATABASE_URL_DIRECT`, **before
merging** the schema-bearing PR; CI enforces `db:pg:verify`. Full procedure
and the applied-migration log: [migration-runbook.md](./migration-runbook.md).

```bash
DATABASE_URL_DIRECT=postgres://... npm run db:pg:migrate
DATABASE_URL_DIRECT=postgres://... npm run db:pg:verify
```

For the initial cutover the target schema is **0015**
(`stores.gbp_primary_category_id` — the owner-picked GBP category; 0014 added
`gbp_access_requests`). Confirm `db:pg:verify` reports the expected table count
before deploying.

Optionally seed the demo cohort into a **staging** database for demos:
`DATABASE_URL_DIRECT=... npm run db:pg:seed` (idempotent — safe to run
twice). **Never** seed demo data into the real production database.

## The stub → production integration flip (read before flipping)

`APP_INTEGRATION_MODE=stub` is the current production value and the entire
v2 system runs on it — every Naver extraction, chat composition, GBP
setup, and publish returns a deterministic stub. **Flipping to `production`
today would break onboarding, chat, and publishing**, not enable them,
because the channel credentials above are not yet configured. Production
adapters fail closed: a missing credential returns a controlled
`blocked_by_credentials` result rather than crashing, but the owner-facing
flow still stops.

Flip to `production` only when, per channel, the credentials exist **and**
the adapter has been validated on a preview:

1. Set the channel's credentials on the owner project (Preview first).
2. Deploy a preview with `APP_INTEGRATION_MODE=production`.
3. Exercise that channel's flow against the preview; confirm real calls
   succeed (not `blocked_by_credentials`).
4. Only then set `APP_INTEGRATION_MODE=production` on Production.

For **GBP setup** specifically, the live `locations.create` body is geocoded and
carries the owner-picked category, so validate it without creating a real
listing first:

```bash
GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… GOOGLE_ORG_REFRESH_TOKEN=… \
GOOGLE_GEOCODING_API_KEY=… GOOGLE_BUSINESS_ACCOUNT_ID=… \
GBP_VALIDATE_ADDRESS="서울 …" GBP_VALIDATE_CATEGORY_GCID="categories/gcid:…" \
node apps/owner-app/scripts/validate-gbp-location.mjs
```

It geocodes the address, assembles the exact production body, and POSTs it with
`validateOnly=true` — proving Google accepts it, and **never** creating a
location. A green run is the gate for trusting live GBP setup.

Preview previews fall back to the stub Naver adapter when production mode
lacks Naver credentials (`runtime-diagnostics.ts`), so a preview can be
partially live. Track the live-readiness of each channel explicitly.

## Rollback posture

Per [postgres-backup-restore-rollback-observability.md](./postgres-backup-restore-rollback-observability.md):

- **App rollback:** redeploy the previous production deployment in Vercel
  (both projects if a `packages/*` change shipped — it rebuilds both).
- **Schema rollback:** restore from the pre-migration backup (§Rollback
  Checklist). Forward-only migrations mean there is no down-migration —
  restore, don't reverse.
- **`db:pg:reset` is blocked in production-like environments** by the reset
  guard. Do not attempt a production reset; restore from backup instead.
- Watch the observability + security checks (§Observability) after cutover.

## Go / No-Go

**Go** when: CI green on `main`; env matrix complete on both projects;
migration applied and `db:pg:verify` clean; backup taken; QA pass clean on
a preview; rollback plan confirmed.

**No-Go** if any of: `db:pg:verify` mismatch; a required owner-app secret
missing; no fresh backup; the `-six` alias not serving the app; or an
attempt to flip `APP_INTEGRATION_MODE=production` without per-channel
credential validation (see the No-Go Conditions in the backup/rollback
runbook).

## Cutover sequence

1. Freeze merges to `main`.
2. Take a production Postgres backup.
3. Run `db:pg:migrate` + `db:pg:verify` over `DATABASE_URL_DIRECT`.
4. Confirm the env matrix on both Vercel projects (Production + Preview).
5. Merge/deploy `main`; verify `glocalx-mvp-six.vercel.app` serves the
   owner app and the admin project serves `/api/health` ok.
6. Seed at least one operator (`seed:admin`) against production.
7. Smoke-test: owner login → onboarding, operator console → Queue / Inbox /
   Stores load. (Stub mode: flows are simulated.)
8. Unfreeze. Keep the rollback plan handy for the first day.
