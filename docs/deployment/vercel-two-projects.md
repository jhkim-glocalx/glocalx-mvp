# Vercel wiring — two projects, one monorepo

Phase 0 turns the repo into an npm-workspaces monorepo
(`apps/owner-app`, `apps/admin`, `packages/*`). Vercel needs one project
per app. Repo-side configuration (the ignore scripts) is committed;
the dashboard steps below are operator actions and must be performed
once by a project admin.

## First: disconnect the duplicate project

The repo is currently connected to TWO Vercel projects in the
`admin-10456072s-projects` team — `glocalx-mvp-private` (canonical) and
`glocalx-mvp` (duplicate). Every push builds both and PRs carry two
Vercel checks. In the duplicate `glocalx-mvp` project: Settings → Git →
disconnect the repository (or delete the project). The unrelated
`glocalx-mvp` project in the `glocal-x` team (`glocalx-mvp-v1.vercel.app`)
is the frozen v1 snapshot — leave it alone.

## Owner app — existing project (`glocalx-mvp-private`)

1. Project → Settings → Build and Deployment → **Root Directory** →
   set to `apps/owner-app`. Leave "Include files outside the root
   directory" **enabled** (the app imports `packages/*` source).
2. Same screen → **Ignored Build Step** → Custom:
   `bash vercel-ignore-step.sh`
3. Environment variables: unchanged — the project already carries the
   Postgres (`DATABASE_PROVIDER`, `DATABASE_URL`, `DATABASE_URL_DIRECT`)
   and integration variables. Nothing moves.
4. Redeploy `main` once after re-rooting and verify the production URL
   serves the app.

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
