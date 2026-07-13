# Engineering Review Readiness

This guide is the reviewer-facing map for the GlocalX MVP. It is backed by
repo-local sources only: `AGENTS.md`, `README.md`, `.env.example`,
`.gitignore`, `package.json`, `playwright.config.ts`, `vitest.config.ts`,
`docs/qa/store-retrieval-gbp-setup/visual-qa-report.md`, `src/**`, and
`tests/e2e/**`.

## Architecture Map

GlocalX is a Next App Router app for owner login, Naver business extraction,
Google Business Profile setup, GBP performance review, and GBP post generation.
The top-level product description and command surface live in `README.md:1-48`.

- Entry and auth surface: `src/app/page.tsx` links to email login/registration
  and posts to `src/app/api/auth/google/start/route.ts` and
  `src/app/api/auth/kakao/start/route.ts`. The demo-login route is test-gated.
- Protected app routing: `src/app/onboarding/page.tsx` and
  `src/app/app/page.tsx` are server pages that call `getDemoSession()` from
  `src/auth/server-session.ts` and redirect based on session and onboarding
  state.
- Client interaction surface: interactive App Router components declare
  `"use client"` in files such as `src/app/onboarding/onboarding-flow.tsx`,
  `src/app/app/app-workspace.tsx`, `src/app/app/post-workspace.tsx`, and
  `src/app/app/performance-dashboard.tsx`.
- API route boundary: JSON routes under `src/app/api/**/route.ts` parse
  payloads with schemas from `src/domain/schemas.ts`, read session cookies,
  enforce store ownership, open SQLite with `src/server/db/sqlite.ts`, and close
  the database in `finally` blocks.
- Domain services: onboarding extraction is in `src/onboarding/extraction.ts`,
  guided onboarding turns are in `src/onboarding/conversation.ts`, GBP setup is
  in `src/gbp/setup.ts`, live GBP eligibility is in `src/gbp/state-machine.ts`,
  and draft/publish behavior is in `src/posts/post-flow.ts`.
- Adapter boundary: `src/integrations/index.ts` selects stub or production
  adapters from `APP_INTEGRATION_MODE`; contracts live in
  `src/integrations/contracts.ts`,
  `src/integrations/gbp-contracts.ts`,
  `src/integrations/conversation-contracts.ts`, and
  `src/integrations/marketing-contracts.ts`.
- Persistence: migrations `0001_glocalx_schema.sql`,
  `0002_email_credentials.sql`, and `0003_user_sessions.sql` define durable
  users, credential hashes, opaque sessions, stores, OAuth identities, business
  profile extractions, GBP accounts and locations, post drafts, publish
  attempts, conversations, reviews, jobs, and audit logs.

## Reviewer Runbook

Start from a clean checkout of the branch under review.

1. Install dependencies with `npm ci` when `node_modules/` is absent.
2. Copy placeholders from `.env.example` into local runtime configuration and
   keep real credentials outside git.
3. Keep `APP_INTEGRATION_MODE=stub` for local reviewer QA unless deliberately
   validating production request specs without sending live network requests.
4. Run the local app with
   `npm run dev -- --hostname 127.0.0.1 --port 3000` and open
   `http://127.0.0.1:3000`.
5. Register a disposable email account for credential-free review. First login
   routes to onboarding; completed sessions route to `/app`. Demo authentication
   is enabled only by the test runner.
6. Run the command matrix from `package.json:6-15`: `npm run typecheck`,
   `npm run lint`, `npm run test`, `npm run build`, `npm run e2e`, and
   `npm run format:check`.
7. Review existing visual QA at
   `docs/qa/store-retrieval-gbp-setup/visual-qa-report.md` and the current
   readiness evidence under `.omo/evidence/`.

## Environment

The app is private and npm-based (`package.json:1-5`). Next is pinned to
`16.3.0-canary.40` in `package.json:17-23`, so reviewers should treat local
Next docs as authoritative for App Router behavior.

`AGENTS.md:1-5` requires reading `node_modules/next/dist/docs/` before any Next
route, server component, or client component code edit. For this readiness gate,
the following local docs were read and indexed in the readiness evidence file:

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
  for App Router Route Handlers, Web `Request`/`Response`, runtime APIs, and
  route context examples.
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`
  for route file conventions, supported HTTP methods, `NextRequest`, async
  cookies and headers, and dynamic route `params` as a promise.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`
  for async `cookies()` and where cookie read/write/delete operations are valid.
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
  and `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`
  for server/client component boundaries, `"use client"` entry points, and
  serializable client props.
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`
  for dynamic segment `params` promise handling.

Key environment variables are documented with placeholders in `.env.example`.
Important reviewer defaults are `APP_INTEGRATION_MODE=stub`,
`RUN_LIVE_INTEGRATION_TESTS=0`, model name variables, OAuth client variables,
Google Business Profile identifiers, Kakao variables, and
`TOKEN_ENCRYPTION_KEY` for OAuth token storage in every environment.

`.gitignore:1-24` excludes generated dependencies, build output, local data,
secret-bearing env files, AI tooling scratch space, and business-only folders.

## Integration Boundaries

The primary boundary is `createIntegrationAdapters()` in
`src/integrations/index.ts`. It selects production adapters only when
`APP_INTEGRATION_MODE` is exactly `production`; otherwise it returns deterministic
stub adapters. Vercel preview and development environments can still use stub
Naver search when production mode lacks Naver credentials through
`src/integrations/runtime-diagnostics.ts`.

Production adapters return request specifications or controlled
`blocked_by_credentials` results when credentials are missing. The app should not
print secret values. Diagnostic shape and missing credential behavior are covered
by `src/integrations/runtime-diagnostics.test.ts` and
`src/integrations/missing-credentials.test.ts`.

External domains are isolated as contracts:

- Naver search: `src/integrations/contracts.ts` and
  `src/integrations/naver-production.ts`.
- Google OAuth and GBP Business Information, Local Posts, Performance, and
  Reviews: `src/integrations/gbp-contracts.ts` and
  `src/integrations/production.ts`.
- OpenAI-backed conversation and marketing generation:
  `src/integrations/conversation-contracts.ts`,
  `src/integrations/openai-conversation.ts`,
  `src/integrations/marketing-contracts.ts`, and
  `src/integrations/openai-production.ts`.

Local review should use stub mode. Production request-spec tests such as
`src/integrations/production-request-specs.test.ts` and
`src/integrations/gbp-performance.test.ts` validate outbound shapes without
requiring live integrations.

## Data And State

SQLite is the durable local store. `src/server/db/sqlite.ts` resolves the default
database path, opens the database, applies all ordered migration files, and keeps
migration compatibility columns for post drafts.

Session state uses an opaque, database-backed session identifier with expiry.
`src/auth/session.ts` defines cookie names and options, while
`src/server/repositories/session-store.ts` validates the session and store
ownership. `src/auth/server-session.ts` uses async Next `cookies()` to read it
on the server.

Owner-facing data flow:

- Onboarding extraction normalizes input, calls the Naver adapter, redacts
  request specs before returning public responses, and persists manual fallback
  records when a result cannot be found (`src/onboarding/extraction.ts` and
  `src/app/api/onboarding/extractions/route.ts`).
- Guided onboarding turns resume or create conversation sessions, replay
  duplicate `clientEventId` requests, record owner and assistant messages, and
  persist extracted slot values (`src/onboarding/conversation.ts` and
  `src/conversations/repository*.ts`).
- Store profile confirmation writes owner-confirmed store data, then GBP setup
  creates or claims GBP records and schedules follow-up for waiting states
  (`src/app/api/onboarding/store-profile/confirm/route.ts`,
  `src/gbp/setup.ts`, `src/gbp/setup-records.ts`, and
  `src/gbp/state-machine.ts`).
- Post drafts and publishing are owner-store scoped. Publish attempts use an
  idempotency key, block live GBP actions until the location is verified, and
  preserve publish history (`src/posts/post-flow.ts`,
  `src/posts/post-repository.ts`, and
  `src/app/api/posts/[draftId]/publish/route.ts`).

## Test Matrix

Use this matrix for reviewer readiness and regression checks.

| Command                | Source                                            | Purpose                                                                               |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `npm run typecheck`    | `package.json:6-15`                               | TypeScript contract check across app, routes, domain, integrations, and tests.        |
| `npm run lint`         | `package.json:6-15`                               | ESLint pass for source and test files.                                                |
| `npm run test`         | `package.json:6-15`, `vitest.config.ts:13-18`     | Vitest unit and route tests, excluding `node_modules/`, `.next/`, and `tests/e2e/**`. |
| `npm run build`        | `package.json:6-15`                               | Next production build check for App Router and client/server boundaries.              |
| `npm run e2e`          | `package.json:6-15`, `playwright.config.ts:15-19` | Playwright browser tests using the configured Chrome channel.                         |
| `npm run format:check` | `package.json:6-15`                               | Prettier formatting check.                                                            |

High-signal test areas:

- Auth/session/OAuth: `src/auth/*.test.ts` and
  `src/app/api/auth/**/route.test.ts`.
- Route validation and ownership: `src/domain/route-schema-validation.test.ts`,
  `src/app/api/conversation-routes.test.ts`, and
  `src/app/api/posts/post-routes-auth.test.ts`.
- Onboarding and conversation persistence:
  `src/onboarding/extraction.test.ts`,
  `src/conversations/conversation-repository*.test.ts`, and
  `src/conversations/conversation-contracts*.test.ts`.
- GBP setup, performance, and location state:
  `src/gbp/setup.test.ts`, `src/gbp/performance.test.ts`,
  `src/gbp/gbp-location-state-machine.test.ts`, and
  `src/integrations/gbp-performance.test.ts`.
- Posting flow and marketing boundaries: `src/posts/post-flow.test.ts`,
  `src/posts/post-flow-boundaries.test.ts`, and
  `src/app/app/app-workspace-*.test.tsx`.
- Browser coverage: `tests/e2e/auth-flow.spec.ts`,
  `tests/e2e/onboarding-ui.spec.ts`, `tests/e2e/gbp-setup.spec.ts`,
  `tests/e2e/gbp-performance.spec.ts`, `tests/e2e/app-workspace.spec.ts`,
  `tests/e2e/post-publish.spec.ts`, and `tests/e2e/final-regression.spec.ts`.

## Known Risks

- Next canary behavior can change. Keep the local docs gate in
  `node_modules/next/dist/docs/` before editing route handlers, server pages, or
  client components. Task 1 records the exact local docs inventory in
  `.omo/evidence/task-1-next-docs-read.txt`.
- Production integrations are mostly validated through adapter contracts and
  request-spec tests unless real credentials are deliberately supplied. Tasks 7
  and 8 cover request-spec, missing-credential, GBP setup, and GBP performance
  paths through `.omo/evidence/task-7-*` and `.omo/evidence/task-8-*`.
- `APP_INTEGRATION_MODE=production` still keeps some adapters stubbed or
  request-spec oriented; reviewers should distinguish live side effects from
  outbound shape validation.
- Production OAuth token storage requires a valid `TOKEN_ENCRYPTION_KEY`; token
  encryption behavior is covered by auth/OAuth tests indexed in
  `.omo/evidence/task-3-auth-*.txt`.
- Local SQLite state is file-backed and can retain prior demo state. Use
  `npm run db:reset` and `npm run db:seed` when reviewer scenarios need a fresh
  local database.
- Verification commands that enter login shells must pin Node 22 with
  `export PATH=/Users/jaehun/.nvm/versions/node/v22.18.0/bin:$PATH`. Earlier
  evidence shows the login shell can resolve Node 26, which is incompatible with
  the installed `better-sqlite3` native module.
- Generated Next artifacts can be stale after route changes. If typecheck reports
  missing App Router helpers, regenerate ignored Next type output before
  rerunning `npm run typecheck`.
- The worktree used for this review is shared and dirty. Task 10 records the
  final commit-surface changed-file and forbidden-path checks in
  `.omo/evidence/task-10-*` so reviewers can separate product docs/source edits
  from ignored orchestration evidence and agent scratch files.
- The latest visual QA report is `DONE_WITH_CONCERNS` in
  `docs/qa/store-retrieval-gbp-setup/visual-qa-report.md`. It records a bottom
  nav visual active-state mismatch, console resource errors during normal flow,
  and a long GBP pending handoff stream.

## Code Comment Policy

Use sparse comments that explain why a branch or boundary exists. Do not annotate
obvious imports, assignments, JSX structure, or test Given/When/Then flows.

Add comments only for reviewer-relevant invariants:

- Next canary conventions such as async `cookies()` and dynamic route `params`
  promises.
- Auth/session validation, store ownership enforcement, and OAuth state
  clearing.
- Privacy boundaries such as public redaction of external request specs and
  support views.
- Idempotency, replay, retry, and duplicate-request handling.
- State machines and blocked live-action states for onboarding, conversations,
  GBP setup, and publish attempts.
- External adapter contract boundaries and credential fallback decisions.

Comments must not include secrets, raw tokens, customer data, business-only file
paths, or unredacted environment dumps.

## Review Readiness Checklist

- Task 1: reviewer guide and local Next canary docs gate are present. Evidence:
  `.omo/evidence/task-1-doc-headings.txt`,
  `.omo/evidence/task-1-doc-preview.md`,
  `.omo/evidence/task-1-doc-secret-scan.txt`, and
  `.omo/evidence/task-1-next-docs-read.txt`.
- Task 2: `README.md` gives a concise engineering-review handoff, command list,
  stub-mode guidance, and visual QA link. Evidence:
  `.omo/evidence/task-2-readme-links.txt`,
  `.omo/evidence/task-2-readme-preview.md`,
  `.omo/evidence/task-2-readme-secret-scan.txt`, and
  `.omo/evidence/task-2-format-fixed.txt`.
- Task 3: Auth, session, and OAuth comments are explanatory and covered by
  targeted auth suites and browser auth flow evidence. Evidence:
  `.omo/evidence/task-3-auth-vitest.txt`,
  `.omo/evidence/task-3-auth-typecheck.txt`,
  `.omo/evidence/task-3-auth-e2e-node22-pinned.txt`, and
  `.omo/evidence/task-3-auth-error-paths-node22-pinned.txt`.
- Task 4: API route and schema boundary comments cover JSON parsing, Zod issue
  normalization, session/store ownership, public redaction, and dynamic route
  params. Evidence: `.omo/evidence/task-4-api-vitest.txt`,
  `.omo/evidence/task-4-api-typecheck.txt`,
  `.omo/evidence/task-4-comment-only-guard.txt`, and
  `.omo/evidence/task-4-added-comment-count.txt`.
- Task 5: Onboarding comments cover Naver search/detail fallback, manual-input
  recovery, prompt-like input handling, and owner-confirmed profile state.
  Evidence: `.omo/evidence/task-5-onboarding-vitest-final.txt`,
  `.omo/evidence/task-5-onboarding-e2e.txt`,
  `.omo/evidence/task-5-onboarding-error-paths-node22.txt`,
  `.omo/evidence/task-5-naver-no-result.txt`, and
  `.omo/evidence/task-5-promptish-input.txt`.
- Task 6: Conversation persistence and state-machine comments cover replay,
  redacted support views, stable IDs, atomic turn recording, and actor/state
  restrictions. Evidence: `.omo/evidence/task-6-conversations-vitest.txt`,
  `.omo/evidence/task-6-conversations-typecheck.txt`,
  `.omo/evidence/task-6-conversation-error-paths.txt`, and
  `.omo/evidence/task-6-node-abi-mismatch.txt`.
- Task 7: Integration comments cover adapter selection, credential fallback,
  Naver detail parsing, request specs, OpenAI output boundaries, and cleanup
  after native-module rebuilds. Evidence:
  `.omo/evidence/task-7-integrations-vitest.txt`,
  `.omo/evidence/task-7-integrations-typecheck.txt`,
  `.omo/evidence/task-7-request-contracts.txt`,
  `.omo/evidence/task-7-comment-only-diff-guard.txt`, and
  `.omo/evidence/task-7-cleanup.txt`.
- Task 8: GBP setup, location state, and performance comments cover verified
  live-action gates, setup follow-ups, performance payload normalization, and
  current-versus-previous comparison windows. Evidence:
  `.omo/evidence/task-8-gbp-vitest.txt`,
  `.omo/evidence/task-8-gbp-typecheck.txt`,
  `.omo/evidence/task-8-gbp-e2e-default-node22.txt`, and
  `.omo/evidence/task-8-adversarial.txt`.
- Task 9: Client orchestration, posting flow, and media-upload comments cover
  draft reset, slot-session scope, client event replay, parser fallbacks,
  publish blocking, and request payload caps. Evidence:
  `.omo/evidence/task-9-client-posting-vitest.txt`,
  `.omo/evidence/task-9-client-posting-typecheck.txt`,
  `.omo/evidence/task-9-client-posting-e2e.txt`,
  `.omo/evidence/task-9-client-posting-edge.txt`,
  `.omo/evidence/task-9-comment-only-diff.txt`, and
  `.omo/evidence/task-9-comment-count.txt`.
- Task 10 is the final audit gate. Evidence:
  `.omo/evidence/task-10-final-doc-headings.txt`,
  `.omo/evidence/task-10-changed-files.txt`,
  `.omo/evidence/task-10-commit-surface-changed-files.txt`,
  `.omo/evidence/task-10-commit-surface-diff-stat.txt`,
  `.omo/evidence/task-10-commit-surface-forbidden-path-check.txt`,
  `.omo/evidence/task-10-commit-surface-omo-absent-check.txt`,
  `.omo/evidence/task-10-source-comment-guard.txt`,
  `.omo/evidence/task-10-added-comments.txt`,
  `.omo/evidence/task-10-lint.txt`,
  `.omo/evidence/task-10-typecheck.txt`,
  `.omo/evidence/task-10-vitest.txt`,
  `.omo/evidence/task-10-final-guide-preview.md`,
  `.omo/evidence/task-10-readme-preview.md`,
  `.omo/evidence/task-10-diff-stat.txt`,
  `.omo/evidence/task-10-final-changed-files.txt`,
  `.omo/evidence/task-10-auth-rerun-vitest.txt`,
  `.omo/evidence/task-10-auth-rerun-typecheck.txt`,
  `.omo/evidence/task-10-adversarial.txt`, and
  `.omo/evidence/task-10-cleanup.txt`.

## Comment Coverage

The source comments added by Tasks 3-9 are intended to explain invariants and
review boundaries only; they do not change route status codes, payload shapes,
schemas, adapter selection, database writes, UI state transitions, or test
assertions. The final Task 10 diff guard treats any non-comment source diff as a
readiness failure.

Commented domains:

- Auth/session/OAuth: server-owned session identifiers, async Next `cookies()`,
  OAuth state clearing, demo-versus-production OAuth branching, encryption
  prerequisites, and first-login routing.
- API routes and schemas: malformed JSON handling, Zod issue normalization,
  session-scoped store ownership, public request-spec redaction, and canary
  dynamic route `params` promises.
- Onboarding: Naver detail-first lookup, Local Search fallback, manual-entry
  recovery, slot confidence, draft/session reset, and owner-confirmed profile
  invalidation.
- Conversation persistence: replay scoping, atomic turn writes, raw-versus-
  redacted support views, deterministic IDs, sequence allocation, and allowed
  state-machine edges.
- Integrations: stub/production adapter selection, preview credential fallback,
  request-spec shape validation, Naver embedded-state parsing, and OpenAI
  structured-output repair boundaries.
- GBP setup and performance: confirmed-profile prerequisites, claimed-location
  admin handoff, verification gates for live actions, request idempotency,
  production performance request execution, and comparison-window normalization.
- Posting and client orchestration: draft payload hashing, client event IDs,
  parser fallback behavior, publish idempotency ownership, media validation, and
  request-body size compression.

## Evidence Index

Readiness evidence is written under `.omo/evidence/` and is intentionally not a
commit surface. `.omo/*` files are orchestration evidence for Boulder state,
ledger entries, and command artifacts; they must remain uncommitted and must be
excluded from commit and handoff changed-file surfaces before forbidden-path
rules are applied. The file names use the prefix assigned by the execution plan;
Task 10 reports the exact final commit-surface changed-file list and command
results in the handoff claim.

- Task 1 documentation/readiness guide: `task-1-doc-headings.txt`,
  `task-1-doc-preview.md`, `task-1-doc-secret-scan.txt`,
  `task-1-next-docs-read.txt`, `task-1-npm-ci.txt`, and
  `task-1-quality-gates.txt`.
- Task 2 README handoff: `task-2-readme-links.txt`,
  `task-2-readme-preview.md`, `task-2-readme-secret-scan.txt`,
  `task-2-format-fixed.txt`, `task-2-adversarial.md`, and
  `task-2-cleanup.txt`.
- Task 3 auth/session/OAuth: `task-3-auth-vitest.txt`,
  `task-3-auth-typecheck.txt`, `task-3-auth-e2e-node22-pinned.txt`,
  `task-3-auth-error-paths-node22-pinned.txt`,
  `task-3-comment-only-diff-guard.txt`, and
  `task-3-runtime-pin-node.txt`.
- Task 4 API/schema routes: `task-4-api-vitest.txt`,
  `task-4-api-typecheck.txt`, `task-4-comment-only-guard.txt`,
  `task-4-added-comment-count.txt`, `task-4-malformed-payloads.txt`, and
  `task-4-adversarial.txt`.
- Task 5 onboarding/Naver/profile: `task-5-onboarding-vitest-final.txt`,
  `task-5-onboarding-e2e.txt`, `task-5-onboarding-error-paths-node22.txt`,
  `task-5-naver-stub-link.txt`, `task-5-naver-no-result.txt`,
  `task-5-malformed-input.txt`, and `task-5-promptish-input.txt`.
- Task 6 conversations/state machines: `task-6-conversations-vitest.txt`,
  `task-6-conversations-typecheck.txt`,
  `task-6-conversation-error-paths.txt`,
  `task-6-conversation-repository.txt`,
  `task-6-node-abi-mismatch.txt`, and `task-6-quality-gates.txt`.
- Task 7 integration boundaries: `task-7-integrations-vitest.txt`,
  `task-7-integrations-typecheck.txt`, `task-7-request-contracts.txt`,
  `task-7-credential-branches.txt`,
  `task-7-comment-only-diff-guard.txt`, `task-7-comment-count-guard.txt`, and
  `task-7-cleanup.txt`.
- Task 8 GBP setup/performance: `task-8-gbp-vitest.txt`,
  `task-8-gbp-typecheck.txt`, `task-8-gbp-e2e-default-node22.txt`,
  `task-8-gbp-contracts.txt`, `task-8-adversarial.txt`,
  `task-8-post-blocked.png`, and `task-8-post-draft.png`.
- Task 9 client/posting/media: `task-9-client-posting-vitest.txt`,
  `task-9-client-posting-typecheck.txt`,
  `task-9-client-posting-e2e.txt`, `task-9-client-posting-edge.txt`,
  `task-9-comment-only-diff.txt`, `task-9-comment-count.txt`, and
  `task-9-changed-source-files.txt`.
- Task 10 final audit: `task-10-final-doc-headings.txt`,
  `task-10-changed-files.txt`, `task-10-source-comment-guard.txt`,
  `task-10-added-comments.txt`, `task-10-lint.txt`,
  `task-10-typecheck.txt`, `task-10-vitest.txt`,
  `task-10-final-guide-preview.md`, `task-10-readme-preview.md`,
  `task-10-diff-stat.txt`, `task-10-final-changed-files.txt`,
  `task-10-commit-surface-changed-files.txt`,
  `task-10-commit-surface-diff-stat.txt`,
  `task-10-commit-surface-forbidden-path-check.txt`,
  `task-10-commit-surface-omo-absent-check.txt`,
  `task-10-commit-surface-doc-headings.txt`,
  `task-10-commit-surface-diff-check.txt`,
  `task-10-auth-rerun-vitest.txt`, `task-10-auth-rerun-typecheck.txt`,
  `task-10-adversarial.txt`, and `task-10-cleanup.txt`.
