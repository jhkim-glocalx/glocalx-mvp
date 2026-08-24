# Engineering Review Readiness

This guide is the reviewer-facing map for the GlocalX MVP. It summarizes
`CLAUDE.md`, `README.md`, `apps/*/package.json`, `apps/*/.env.example`,
`.gitignore`, and the current source tree — read those directly for
anything this doc simplifies away.

## Architecture Map

GlocalX is an npm-workspaces monorepo with two Next.js App Router apps
sharing one database:

- `apps/owner-app` — the mobile-first owner app: login, Naver business
  extraction, Google Business Profile (GBP) setup, GBP performance
  review, and GBP post generation/publishing.
- `apps/admin` — the operator dashboard (invite-only admin auth): queue,
  inbox, stores, and org-credential management for concierge GBP
  operations.
- `packages/db` — SQLite (local dev) and Postgres (Vercel/production)
  clients plus ordered migrations.
- `packages/domain` — schemas, conversation contracts, state machines
  (GBP access/verification, campaign, publish eligibility), password
  hashing.
- `packages/integrations` — stub and production adapters for Naver,
  Google (OAuth, GBP Business Information/Local Posts/Performance/
  Reviews, Geocoding), OpenAI, Instagram, and Vercel Blob.
- `packages/ui` — shared design tokens.

`packages/*` are consumed as TypeScript source, not built output — both
apps list them in `transpilePackages`.

Owner-app highlights (paths relative to `apps/owner-app/`):

- Entry/auth: `src/app/page.tsx` links to email login/registration and
  posts to `src/app/api/auth/google/start/route.ts` and
  `src/app/api/auth/kakao/start/route.ts`.
- Protected routing: `src/app/onboarding/page.tsx` and
  `src/app/app/page.tsx` are server pages that call `getDemoSession()`
  from `src/auth/server-session.ts`.
- API routes: `src/app/api/**/route.ts` validate payloads against
  `@glocalx/domain` schemas, enforce store ownership, open the database
  via `@glocalx/db`, and close it in `finally`.
- Domain services: `src/onboarding/extraction.ts` and
  `src/onboarding/conversation.ts` (onboarding), `src/gbp/setup.ts` and
  `src/gbp/state-machine.ts` (GBP), `src/posts/post-flow.ts`
  (draft/publish).

Admin highlights (paths relative to `apps/admin/`):

- Separate `admin_users`/`admin_sessions` tables and cookie
  (`src/auth/session.ts`, `src/server/admin-auth-store.ts`) — owner and
  admin sessions never resolve across apps.
- Operator views/actions in `src/server/`: `queue-view.ts`,
  `inbox-view.ts`, `gbp-access-view.ts`, `gbp-verification-view.ts`,
  `post-draft-view.ts`, `audit-log-store.ts`, `campaign-publish.ts`.

## Reviewer Runbook

Start from a clean checkout of the branch under review.

1. `npm ci` when `node_modules/` is absent.
2. Copy `apps/owner-app/.env.example` to `apps/owner-app/.env.local` and
   `apps/admin/.env.example` to `apps/admin/.env.local`. Keep real
   credentials out of git.
3. Keep `APP_INTEGRATION_MODE=stub` for local review unless deliberately
   validating production request specs without live network calls.
4. Run the apps:
   - Owner: `npm run dev -- --hostname 127.0.0.1 --port 3000` →
     `http://127.0.0.1:3000`
   - Admin: `npm run dev -w apps/admin` →
     `http://127.0.0.1:3100` (seed an operator first, see below)
5. Register a disposable email account for owner-side review. First
   login routes to onboarding; completed sessions route to `/app`.
6. Seed a local admin: `ADMIN_SEED_EMAIL=... ADMIN_SEED_PASSWORD=... npm run seed:admin -w apps/admin`.
7. Run the full command matrix from the repo root: `npm run typecheck`,
   `npm run lint`, `npm run test`, `npm run build` (owner app; admin:
   `npm run build -w apps/admin`), `npm run e2e`, `npm run e2e:cross`,
   and `npm run format:check`.
8. Review existing visual QA at
   `docs/qa/store-retrieval-gbp-setup/visual-qa-report.md` — this
   predates the current UI in places; treat it as historical context,
   not a live status.

## Environment

Both apps are private and npm-based. Next is pinned to
`16.3.0-canary.40` — treat `node_modules/next/dist/docs/` as
authoritative for App Router behavior over training data (`CLAUDE.md`
requires reading the relevant guide there before any route/server/client
component edit).

Key environment variables are documented with placeholders in
`apps/owner-app/.env.example` and `apps/admin/.env.example`. Reviewer
defaults: `APP_INTEGRATION_MODE=stub`, `RUN_LIVE_INTEGRATION_TESTS=0`,
plus OAuth client variables, Google Business Profile identifiers, Kakao
variables, and `TOKEN_ENCRYPTION_KEY` for OAuth token storage in every
environment.

`.gitignore` excludes generated dependencies, build output, local data,
secret-bearing env files, AI tooling scratch space (`.claude/`, `.omo/`,
`.gstack/`), and business-only folders (`01_documents/`, `02_assets/`,
`workspace/`).

## Integration Boundaries

The primary boundary is `createIntegrationAdapters()` in
`packages/integrations/src/index.ts`. It selects production adapters
only when `APP_INTEGRATION_MODE` is exactly `production`; otherwise it
returns deterministic stub adapters. Vercel previews fall back to stub
Naver search when production mode lacks Naver credentials
(`packages/integrations/src/runtime-diagnostics.ts`).

Production adapters return request specifications or a controlled
`blocked_by_credentials` result when credentials are missing, and never
print secret values. Covered by
`packages/integrations/src/runtime-diagnostics.test.ts` and
`packages/integrations/src/missing-credentials.test.ts`.

External domains are isolated as contracts under
`packages/integrations/src/`:

- Naver search: `contracts.ts`, `naver-production.ts`.
- Google OAuth, GBP (Business Information, Local Posts, Performance,
  Reviews), and Geocoding: `gbp-contracts.ts`, `production.ts`,
  `production-performance.ts`, `geocoding-contracts.ts`,
  `geocoding-production.ts`, `google-org-auth.ts`.
- OpenAI-backed conversation, marketing, and CS-assistant generation:
  `conversation-contracts.ts`, `openai-conversation.ts`,
  `marketing-contracts.ts`, `openai-production.ts`,
  `cs-assistant-contracts.ts`, `openai-cs-assistant.ts`.
- Instagram Business Login and publishing: `instagram-contracts.ts`,
  `instagram-oauth-contracts.ts`, `instagram-oauth.ts`, `instagram.ts`.
- Media storage: `media-store.ts`, `vercel-blob-production.ts`.

Local review should use stub mode. Production request-spec tests such
as `production-request-specs.test.ts` and `gbp-performance.test.ts`
validate outbound shapes without requiring live integrations.

## Data And State

SQLite (`packages/db/src/sqlite.ts`) is the local default; Postgres
(`packages/db/src/postgres/`) is required for any Vercel runtime
(`VERCEL=1` or `VERCEL_ENV=preview|production`). SQLite applies all
ordered migrations on open; Postgres migrates only via
`npm run db:pg:migrate` (see `docs/deployment/migration-runbook.md`).
Migrations (20+ and growing — check `packages/db/src/postgres/migrations/`
for the current head) define users, credential hashes, opaque owner and
admin sessions, auth rate limits, stores, OAuth identities, business
profile extractions, GBP accounts/locations/access/verification state,
post drafts, publish attempts, conversations, campaigns, org
credentials, and audit logs.

Session state uses an opaque, database-backed session identifier with
expiry, scoped separately per app (owner: `apps/owner-app/src/auth/`;
admin: `apps/admin/src/auth/`) so sessions never resolve across apps.

Owner-facing data flow:

- Onboarding extraction normalizes input, calls the Naver adapter,
  redacts request specs before returning public responses, and persists
  manual-fallback records when no result is found
  (`apps/owner-app/src/onboarding/extraction.ts`).
- Guided onboarding turns resume/create conversation sessions, replay
  duplicate `clientEventId` requests, and persist extracted slot values
  (`apps/owner-app/src/onboarding/conversation.ts`).
- Store profile confirmation writes owner-confirmed data, then GBP setup
  creates/claims GBP records and schedules follow-up for waiting states
  (`apps/owner-app/src/gbp/setup.ts`, `setup-records.ts`,
  `state-machine.ts`).
- Post drafts/publishing are owner-store scoped, use an idempotency key,
  block live GBP actions until the location is verified, and preserve
  publish history (`apps/owner-app/src/posts/post-flow.ts`,
  `post-repository.ts`).

Operator-facing data flow (admin): concierge GBP adoption/verification
and post-CTA operator actions go through `apps/admin/src/server/`
(`gbp-access-view.ts`, `gbp-verification-view.ts`, `queue-view.ts`),
writing through the same `@glocalx/db` tables with an audit-log entry
per action (`audit-log-store.ts`).

## Test Matrix

Run from the repo root unless noted.

| Command                | Purpose                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `npm run typecheck`    | Root harness + `next typegen` + `tsc --noEmit` in every workspace.                    |
| `npm run lint`         | ESLint across the whole repo.                                                         |
| `npm run test`         | Vitest across all workspaces (owner-app, admin, packages/\*).                         |
| `npm run build`        | Owner-app production build (admin: `npm run build -w apps/admin`).                    |
| `npm run e2e`          | Owner-app Playwright suite, stub mode, Chrome channel.                                |
| `npm run e2e:cross`    | Dual-app harness (`tests/e2e-cross/`) — owner + admin against one shared stub SQLite. |
| `npm run e2e:postgres` | Owner-app suite against Postgres.                                                     |
| `npm run format:check` | Prettier formatting check.                                                            |

High-signal test areas (not exhaustive — search each package for
`*.test.ts`/`*.test.tsx`):

- Owner auth/session/OAuth: `apps/owner-app/src/auth/*.test.ts`.
- Owner GBP lifecycle: `apps/owner-app/src/gbp/*.test.ts` (setup,
  verification, adoption matching, performance, location state
  machine).
- Owner onboarding/conversation: `apps/owner-app/src/onboarding/*.test.ts`.
- Owner posting: `apps/owner-app/src/posts/*.test.ts`.
- Admin auth and operator routes:
  `apps/admin/src/server/admin-auth-store.test.ts`,
  `apps/admin/src/app/api/**/route.test.ts` (queue, inbox, stores,
  settings).
- Domain contracts and state machines: `packages/domain/src/*.test.ts`
  (GBP access/verification, campaign, publish eligibility).
- Integration adapters: `packages/integrations/src/*.test.ts` (adapter
  selection, credential fallback, request specs, OAuth).
- Cross-app browser coverage: `tests/e2e-cross/*.spec.ts` (owner↔admin
  handoffs — GBP access, org credentials, campaign pipeline, chat).
- Owner-app browser coverage: `apps/owner-app/tests/e2e/*.spec.ts`.

## Known Risks

- Next canary behavior can change between releases. Keep the local docs
  gate in `node_modules/next/dist/docs/` before editing route handlers,
  server pages, or client components.
- Production integrations are mostly validated through adapter contracts
  and request-spec tests (`*-request-specs.test.ts`,
  `gbp-performance.test.ts`) rather than live calls;
  `APP_INTEGRATION_MODE=production` can still leave some adapters
  request-spec-only.
- Production OAuth token storage requires a valid `TOKEN_ENCRYPTION_KEY`.
- Local SQLite state is file-backed and persists demo data between runs.
  `npm run db:reset` / `npm run db:seed` wipe tables in place (safe
  alongside a running dev server or e2e harness) but cannot rebuild a
  schema that predates a migration the `ensure*` helpers in
  `packages/db/src/sqlite.ts` don't cover — stop the dev server and
  `rm -rf .glocalx` first in that case.
- Use Node 22 in verification shells — the native `better-sqlite3`
  module is incompatible with newer Node majors (e.g. 26). Check
  `node -v` if a shell resolves an unexpected version.
- Generated Next type output can go stale after route changes;
  regenerate it if `npm run typecheck` reports missing App Router
  helpers.
- The visual QA report at
  `docs/qa/store-retrieval-gbp-setup/visual-qa-report.md` predates the
  current owner-app UI and admin app entirely — treat it as historical,
  not a live status.

## Code Comment Policy

Use sparse comments that explain _why_ a branch or boundary exists —
not what obvious imports, assignments, JSX structure, or Given/When/Then
test flows already say. Reserve comments for:

- Next canary conventions (async `cookies()`, dynamic route `params`
  promises).
- Auth/session/ownership enforcement, OAuth state clearing.
- Privacy redaction boundaries (public redaction of external request
  specs and support views).
- Idempotency, replay, retry, and duplicate-request handling.
- State machines for onboarding, GBP (setup/access/verification),
  campaign, and publish.
- External adapter contract boundaries and credential fallback
  decisions.

Never put secrets, raw tokens, customer data, or unredacted env dumps in
a comment.
