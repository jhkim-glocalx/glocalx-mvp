# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## This is NOT the Next.js you know

Next is pinned to `16.3.0-canary.40` and has breaking changes vs. training
data — read the relevant guide in `node_modules/next/dist/docs/` before
writing any route handler, server page, or client component code. Heed
deprecation notices.

## Git workflow

### Branch strategy (GitHub Flow / trunk-based)

`main` is the only long-lived branch and is always deployable. There is
deliberately no persistent `dev`/staging branch — that pattern let `dev`
drift 17 commits ahead of `main` (including security fixes) before anyone
noticed, which defeats the point of `main` being the source of truth.

| Branch        | Purpose                                           | Deploys to                                                                                                                                                        |
| ------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`        | Production — always deployable                    | Vercel production (`glocalx-mvp-six.vercel.app` — **not** `glocalx-mvp.vercel.app`, which is the frozen v1 project; see `docs/deployment/vercel-two-projects.md`) |
| `feat/<name>` | Short-lived feature branches, branched off `main` | Vercel preview (per-push URL)                                                                                                                                     |
| `fix/<name>`  | Short-lived bug fix branches, branched off `main` | Vercel preview (per-push URL)                                                                                                                                     |

### Rules

- **Never commit directly to `main`.** All changes go through a PR.
- Branch off `main` for every feature/fix. Each push gets its own Vercel
  preview URL — that preview is the staging environment for the change,
  there's no separate branch to keep in sync.
- CI (lint, typecheck, test, e2e, build) must pass before merging.
- Merge via PR once CI is green and the preview looks right. Merging to
  `main` deploys to production immediately, so keep branches short-lived
  (hours to a couple of days) to keep that low-risk.
- Delete feature/fix branches after merging.

### Commit conventions (Conventional Commits)

```
<type>(<scope>): <short description>
```

Types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `style`, `perf`

Examples:

- `feat(auth): add demo owner session flow`
- `fix(onboarding): expose clear submit and next actions`
- `chore(git): exclude AI tooling and business files from tracking`

### What NOT to commit

The following are gitignored and must never be committed:

- `.claude/` — AI tooling config
- `.omo/` — agent scratch space
- `.gstack/` — gstack tooling
- `01_documents/`, `02_assets/`, `workspace/` — business files, not app code
- `.env` — secrets (use each app's `.env.example` for the template)

### Stacked PRs (a PR branched off another open PR)

When PR **B** is branched off PR **A**'s branch instead of `main`:

- **Retarget B to `main` before merging A** — or merge A **without**
  `--delete-branch`. Deleting A's branch while it is still B's base makes
  GitHub **close** B (it does _not_ auto-retarget it), and a PR whose base
  branch is gone cannot be reopened.
- **Recovery if B was closed this way:** rebase B onto the updated `main`
  and open a fresh PR. Because A was squash-merged, drop A's now-redundant
  commits by replaying only B's own:

  ```bash
  git rebase --onto origin/main <A-branch-tip-sha> <B-branch>
  git push --force-with-lease
  gh pr create --base main --head <B-branch>
  ```

  Verify `git diff --stat origin/main...HEAD` shows only B's files before
  pushing.

## Role and coding workflow

### Who writes code

Write and edit source files directly. Use Codex (`/codex`) only for a second opinion — e.g. sanity-checking a tricky design decision or getting independent review — not as the default path for implementation.

### Your role

Implement the task, verify it (typecheck/lint/test/build as applicable, plus manual QA for UI changes), and ship once verified.

## What this repo is

An npm-workspaces monorepo with two Next.js App Router apps sharing one
database:

- `apps/owner-app` — the mobile-first owner app: login, Naver business
  extraction, Google Business Profile (GBP) setup, GBP performance
  review, and GBP post generation/publishing.
- `apps/admin` — the operator dashboard (dark ops theme, invite-only
  admin auth; sections fill in through the v2 phases).
- `packages/db` (migrations + SQLite/Postgres clients),
  `packages/domain` (schemas, conversation contracts, password hashing),
  `packages/integrations` (stub/production adapters), `packages/ui`
  (design tokens) — consumed as TypeScript source; both apps must list
  them in `transpilePackages`.

Further reading: `README.md`, `docs/v2/` (program plan, architecture,
delivery plan, design decisions, ops runbook, Instagram-connect
onboarding — Korean translations live alongside as `*.ko.md`),
`docs/deployment/` (migration runbook, Postgres cutover/rollback, the
two-Vercel-projects split), and `DESIGN.md` (visual design system).

## Commands

Root scripts delegate to workspaces, so CI and daily commands run from
the repo root:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000   # owner app at http://127.0.0.1:3000
npm run dev -w apps/admin                          # admin at http://127.0.0.1:3100
npm run typecheck      # root harness + every workspace
npm run lint           # eslint . (whole repo)
npm run test           # vitest across all workspaces
npm run build          # owner app (admin: npm run build -w apps/admin)
npm run e2e            # owner-app suite (stub mode, Chrome channel)
npm run e2e:cross      # dual-app harness (owner + admin, one stub SQLite)
npm run e2e:postgres   # owner-app suite against Postgres
npm run format:check   # prettier --check .
```

Run a single test:

```bash
npx vitest run apps/owner-app/src/gbp/setup.test.ts
npx vitest run -t "test name substring"
cd apps/owner-app && npx playwright test tests/e2e/auth-flow.spec.ts
```

Seed a local admin for the dashboard:

```bash
ADMIN_SEED_EMAIL=... ADMIN_SEED_PASSWORD=... npm run seed:admin -w apps/admin
```

Database (SQLite is the local default; Postgres is required for any Vercel
runtime — `VERCEL=1` or `VERCEL_ENV=preview|production`):

```bash
npm run db:reset / db:seed                              # sqlite
npm run db:pg:migrate / db:pg:reset / db:pg:seed / db:pg:verify   # postgres
npm run db:migrate:sqlite-to-pg
```

Keep `APP_INTEGRATION_MODE=stub` for local development and review — it
returns deterministic Naver/GBP/OpenAI responses without live credentials.
Copy `apps/owner-app/.env.example` to `apps/owner-app/.env.local` and
`apps/admin/.env.example` to `apps/admin/.env.local`; never commit real
credentials.

Use Node 22 in verification shells — the native `better-sqlite3` module
is incompatible with newer Node majors (e.g. 26). Check with `node -v`
before running `db:*` or `test`/`e2e` scripts if a shell resolves an
unexpected version.

## Architecture

Owner-app paths below are relative to `apps/owner-app/`.

- **Entry/auth**: `src/app/page.tsx` links to email login/registration and
  posts to `src/app/api/auth/google/start/route.ts` and
  `src/app/api/auth/kakao/start/route.ts`.
- **Protected routing**: `src/app/onboarding/page.tsx` and
  `src/app/app/page.tsx` are server pages that call `getDemoSession()` from
  `src/auth/server-session.ts` and redirect based on session/onboarding
  state.
- **Client surface**: interactive App Router components declare
  `"use client"`, e.g. `src/app/onboarding/onboarding-flow.tsx`,
  `src/app/app/app-workspace.tsx`, `src/app/app/post-workspace.tsx`,
  `src/app/app/performance-dashboard.tsx`.
- **API routes**: `src/app/api/**/route.ts` validate payloads against
  schemas in `@glocalx/domain`, read session cookies, enforce store
  ownership, open the database via `@glocalx/db`, and close the
  connection in `finally`.
- **Domain services**: onboarding extraction
  (`src/onboarding/extraction.ts`), guided onboarding turns
  (`src/onboarding/conversation.ts`), GBP setup (`src/gbp/setup.ts`),
  live GBP eligibility (`src/gbp/state-machine.ts`), draft/publish
  behavior (`src/posts/post-flow.ts`).
- **Adapter boundary**: `createIntegrationAdapters()` in
  `packages/integrations/src/index.ts` selects production adapters only
  when `APP_INTEGRATION_MODE` is exactly `production`; otherwise returns
  deterministic stub adapters. Contracts live in `contracts.ts`,
  `gbp-contracts.ts`, `conversation-contracts.ts`,
  `marketing-contracts.ts`; production implementations in
  `naver-production.ts`, `production.ts`, `openai-production.ts`,
  `openai-conversation.ts`. Vercel previews fall back to stub Naver search
  when production mode lacks Naver credentials
  (`packages/integrations/src/runtime-diagnostics.ts`). Production
  adapters never print secret values — missing-credential paths return a
  controlled `blocked_by_credentials` result instead.
- **Persistence**: ordered SQL migrations under `packages/db/src/`
  (SQLite) and `packages/db/src/postgres/migrations/` define users,
  credential hashes, opaque sessions (owner and admin), auth rate limits,
  stores, OAuth identities, business profile extractions, GBP
  accounts/locations, post drafts, publish attempts, conversations,
  reviews, jobs, and audit logs. `packages/db/src/sqlite.ts` applies all
  migrations on open (local-dev path only); Postgres migrates solely via
  `db:pg:migrate` (see `docs/deployment/migration-runbook.md`).
- **Sessions**: opaque, database-backed session id with expiry.
  Owner: `src/auth/session.ts` defines cookie names/options,
  `src/server/repositories/session-store.ts` validates session + store
  ownership, `src/auth/server-session.ts` reads it server-side via async
  `cookies()`. Admin (`apps/admin/`): separate `admin_users` /
  `admin_sessions` tables and cookie (`src/auth/session.ts`,
  `src/server/admin-auth-store.ts`) — owner and admin sessions must never
  resolve across apps.
- **Owner data flow**: onboarding extraction normalizes input, calls the
  Naver adapter, redacts request specs before returning public responses,
  and persists manual-fallback records when no result is found
  (`src/onboarding/extraction.ts`). Store confirmation writes owner-confirmed
  data, then GBP setup creates/claims GBP records and schedules follow-up
  for waiting states (`src/gbp/setup.ts`, `src/gbp/setup-records.ts`,
  `src/gbp/state-machine.ts`). Post drafts/publishing are owner-store
  scoped, use an idempotency key, block live GBP actions until the location
  is verified, and preserve publish history
  (`src/posts/post-flow.ts`, `src/posts/post-repository.ts`).

## Code comment policy

Use sparse comments that explain _why_ a branch or boundary exists — not
what obvious imports, assignments, JSX structure, or Given/When/Then test
flows already say. Reserve comments for: Next canary conventions (async
`cookies()`, dynamic route `params` promises), auth/session/ownership
enforcement, privacy redaction boundaries, idempotency/replay/retry
handling, state machines for onboarding/GBP/publish, and adapter
credential-fallback decisions. Never put secrets, raw tokens, customer
data, or unredacted env dumps in a comment.

## Known risks

- Production integrations are mostly validated through adapter contracts
  and request-spec tests (`*-request-specs.test.ts`,
  `gbp-performance.test.ts`) rather than live calls; `APP_INTEGRATION_MODE=production`
  can still leave some adapters request-spec-only.
- Local SQLite state is file-backed and persists demo data between runs —
  use `npm run db:reset` / `npm run db:seed` for a clean slate. Both wipe the
  tables in place rather than deleting the file, so they are safe to run while
  a dev server or the e2e harness holds the database open. They therefore
  cannot rebuild a schema that predates a migration the `ensure*` helpers in
  `packages/db/src/sqlite.ts` don't cover — for that, stop the dev server and
  `rm -rf .glocalx` first.
- Generated Next type output can go stale after route changes; regenerate
  it if `npm run typecheck` reports missing App Router helpers.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:

- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
