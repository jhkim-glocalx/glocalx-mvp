# Vercel wiring — two projects, one monorepo

Phase 0 turns the repo into an npm-workspaces monorepo
(`apps/owner-app`, `apps/admin`, `packages/*`). Vercel needs one project
per app. Repo-side configuration (the ignore scripts) is committed;
the dashboard steps below are operator actions and must be performed
once by a project admin.

## Project layout (decided 2026-07-17)

Three Vercel projects exist; only ONE deploys from this repo:

| Project               | Team                       | Role                                                                                                          |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `glocalx-mvp`         | `admin-10456072s-projects` | **Repo-connected.** Deploys `main` → `glocalx-mvp.vercel.app` and per-PR previews.                            |
| `glocalx-mvp-private` | `admin-10456072s-projects` | Git-disconnected. Holds the purchased customer domain; promote builds to it deliberately, not on every merge. |
| `glocalx-mvp`         | `glocal-x`                 | Frozen v1 snapshot (`glocalx-mvp-v1.vercel.app`). Leave alone.                                                |

## Owner app — repo-connected project (`glocalx-mvp`)

1. Project → Settings → Build and Deployment → **Root Directory** →
   set to `apps/owner-app`. Leave "Include files outside the root
   directory" **enabled** (the app imports `packages/*` source).
2. Same screen → **Ignored Build Step** → Custom:
   `bash vercel-ignore-step.sh`
3. Environment variables: confirm the Postgres (`DATABASE_PROVIDER`,
   `DATABASE_URL`, `DATABASE_URL_DIRECT`) and integration variables are
   present on THIS project — they were originally configured when
   `glocalx-mvp-private` was the deploy target, so copy over anything
   missing.
4. Redeploy `main` once after re-rooting and verify
   `glocalx-mvp.vercel.app` serves the app.

## Admin — new project (`glocalx-admin`)

1. Vercel → Add New Project → import the same GitHub repo
   (`jhkim-glocalx/glocalx-mvp`).
2. **Root Directory**: `apps/admin` (keep "Include files outside the
   root directory" enabled).
3. **Ignored Build Step** → Custom: `bash vercel-ignore-step.sh`
4. Environment variables (Production + Preview):
   - `DATABASE_PROVIDER=postgres`
   - `DATABASE_URL` — same pooled Neon URL as the owner project
   - `DATABASE_URL_DIRECT` — same direct Neon URL
   - `APP_INTEGRATION_MODE=stub` until admin-side production
     integrations exist (Phase 3+)
   - Admin auth variables once Phase 0 task 3 lands (see
     `apps/admin/.env.example`).
5. Branch mapping is GitHub Flow, same as the owner project: `main` →
   production, every PR gets a preview URL.

## Verification (Phase 0 acceptance)

- Push a change under `apps/admin/` only → owner project reports
  "Build skipped", admin project builds. Reverse for
  `apps/owner-app/`-only changes. A `packages/`-only change builds
  **both**.
- Admin preview URL responds at `/api/health` with
  `{"ok":true,"service":"glocalx-admin"}`.
- Admin login round-trip works on a preview against staging Neon
  (after task 3 lands).

## Migration ownership (unchanged, restated)

`db:pg:migrate` runs exactly once per schema change, by the PM/founder
over `DATABASE_URL_DIRECT`, **before merging** any schema-bearing PR.
Neither app migrates at runtime; CI enforces `db:pg:verify`. See
docs/v2/architecture.md §2.
