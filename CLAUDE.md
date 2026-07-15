# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Role and coding workflow

### Who writes code

Write and edit source files directly. Use Codex (`/codex`) only for a second opinion — e.g. sanity-checking a tricky design decision or getting independent review — not as the default path for implementation.

### Your role

Implement the task, verify it (typecheck/lint/test/build as applicable, plus manual QA for UI changes), and ship once verified.

## What this app is

GlocalX is a mobile-first Next.js App Router app for owner login, Naver
business extraction, Google Business Profile (GBP) setup, GBP performance
review, and GBP post generation/publishing. Further reading:
`README.md`, `docs/engineering-review-readiness.md` (reviewer-facing
architecture map), and `DESIGN.md` (visual design system).

Next is pinned to `16.3.0-canary.40` and has breaking changes vs. training
data — read the relevant guide in `node_modules/next/dist/docs/` before
writing any route handler, server page, or client component code.

## Commands

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000   # app at http://127.0.0.1:3000
npm run typecheck      # next typegen && tsc --noEmit
npm run lint           # eslint .
npm run test           # vitest run (unit/route tests; excludes tests/e2e/**)
npm run build
npm run e2e             # playwright test (stub integration mode, Chrome channel)
npm run e2e:postgres    # same, against a Postgres-backed DB
npm run format:check    # prettier --check .
```

Run a single test:

```bash
npx vitest run src/gbp/setup.test.ts
npx vitest run -t "test name substring"
npx playwright test tests/e2e/auth-flow.spec.ts
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
Copy `.env.example` to `.env.local`; never commit real credentials.

Pin Node 22 in verification shells
(`export PATH=/Users/jaehun/.nvm/versions/node/v22.18.0/bin:$PATH`) — a
login shell resolving Node 26 is incompatible with the native
`better-sqlite3` module.

## Architecture

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
  schemas in `src/domain/schemas.ts`, read session cookies, enforce store
  ownership, open SQLite via `src/server/db/sqlite.ts`, and close the
  connection in `finally`.
- **Domain services**: onboarding extraction
  (`src/onboarding/extraction.ts`), guided onboarding turns
  (`src/onboarding/conversation.ts`), GBP setup (`src/gbp/setup.ts`),
  live GBP eligibility (`src/gbp/state-machine.ts`), draft/publish
  behavior (`src/posts/post-flow.ts`).
- **Adapter boundary**: `createIntegrationAdapters()` in
  `src/integrations/index.ts` selects production adapters only when
  `APP_INTEGRATION_MODE` is exactly `production`; otherwise returns
  deterministic stub adapters. Contracts live in `contracts.ts`,
  `gbp-contracts.ts`, `conversation-contracts.ts`,
  `marketing-contracts.ts`; production implementations in
  `naver-production.ts`, `production.ts`, `openai-production.ts`,
  `openai-conversation.ts`. Vercel previews fall back to stub Naver search
  when production mode lacks Naver credentials
  (`src/integrations/runtime-diagnostics.ts`). Production adapters never
  print secret values — missing-credential paths return a controlled
  `blocked_by_credentials` result instead.
- **Persistence**: ordered SQL migrations under `src/server/db/` define
  users, credential hashes, opaque sessions, auth rate limits, stores,
  OAuth identities, business profile extractions, GBP accounts/locations,
  post drafts, publish attempts, conversations, reviews, jobs, and audit
  logs. `src/server/db/sqlite.ts` applies all migrations on open.
- **Sessions**: opaque, database-backed session id with expiry.
  `src/auth/session.ts` defines cookie names/options,
  `src/server/repositories/session-store.ts` validates session + store
  ownership, `src/auth/server-session.ts` reads it server-side via async
  `cookies()`.
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
  use `npm run db:reset` / `npm run db:seed` for a clean slate.
- Generated Next type output can go stale after route changes; regenerate
  it if `npm run typecheck` reports missing App Router helpers.
