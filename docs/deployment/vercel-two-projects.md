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
   `bash ../../vercel-ignore-step.sh apps/owner-app`
   (the script is committed at the repo root; it skips this project's
   build unless `apps/owner-app`, any shared `packages/*`, or a root
   build file changed — see [Ignored build step](#ignored-build-step)).
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
3. **Ignored Build Step** → Custom:
   `bash ../../vercel-ignore-step.sh apps/admin`
   (see [Ignored build step](#ignored-build-step)).
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

## Ignored build step

`vercel-ignore-step.sh` (repo root) is the shared gate both projects call
from their **Ignored Build Step**, passing their own app dir as the
argument. Vercel runs the command from the project's Root Directory
(`apps/<app>`), so the command reaches the root script via `../../`.

The script builds when the passed app dir, any shared `packages/*`, or a
root build file (`package.json`, `package-lock.json`, `tsconfig*.json`)
changed between `HEAD^` and `HEAD` — so a `packages/*` change rebuilds
**both** apps, an app-only change rebuilds just that app, and a docs-only
change skips both. It fails safe (builds) on the first deploy, a shallow
clone without `HEAD^`, or an unrecognized app dir. Per Vercel's
convention it exits `1` to build and `0` to skip.

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
