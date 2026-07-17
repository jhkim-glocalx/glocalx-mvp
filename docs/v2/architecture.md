# GlocalX v2 — Architecture

Status: Proposed
Date: 2026-07-16
Companion docs: [README.md](README.md) (scope), [delivery-plan.md](delivery-plan.md) (phasing)

## 1. Deployment topology

Decision (founder-confirmed 2026-07-16): **one monorepo, two Next.js apps,
two Vercel projects, one shared Neon Postgres.**

```
glocalx-mvp/
├── apps/
│   ├── owner-app/        # today's src/ app, moved — owner-facing, mobile-first
│   └── admin/            # new — internal operations dashboard
├── packages/
│   ├── db/               # migrations, connection factory, repositories
│   ├── domain/           # schemas, state machines, post-flow, campaign logic
│   ├── integrations/     # adapter contracts + stub/production implementations
│   └── ui/               # design tokens + shared primitives (theme parity)
├── docs/
└── package.json          # npm workspaces root
```

| Property              | owner-app                                              | admin                                                    |
| --------------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| Vercel project        | existing (`glocalx-mvp-private`)                         | new (`glocalx-admin`)                                    |
| Vercel root directory | `apps/owner-app`                                       | `apps/admin`                                             |
| Branch mapping        | GitHub Flow: `main` → prod, per-PR previews as staging | same flow, own URLs                                      |
| Audience              | store owners (public)                                  | operators only (invite-gated)                            |
| Session cookie        | existing opaque owner session                          | separate admin session (different name, different table) |
| Database              | shared Neon Postgres (pooled `DATABASE_URL`)           | same database, same rules                                |

Rules carried over unchanged from the v1 ADRs
(`docs/architecture/v2-postgres-architecture.md`):

- Any Vercel runtime requires `DATABASE_PROVIDER=postgres` with pooled
  `DATABASE_URL` plus a direct URL for migrations/ops. SQLite stays
  local-dev/test only.
- No `LISTEN/NOTIFY`, session-level `SET`, or prepared statements that
  assume a persistent session (Neon pooling constraint). This is one of
  the reasons chat uses polling (§5).
- `APP_INTEGRATION_MODE` selects stub vs production adapters in **both**
  apps. Stub is the default everywhere except production deployments.

### Why not a single app with `/admin` routes

Separation was a founder decision; the engineering justification: the
admin app carries organization-account credentials (GBP org OAuth, platform
publishing tokens) and operator tooling that must never ship in the
public bundle, wants an independent deploy cadence, and needs an auth
system with different threat assumptions (no public signup, allowlist
only). Two projects on one repo gives that isolation while `packages/*`
prevents schema/logic drift.

### Workspace mechanics

- npm workspaces (already on npm; no new package manager).
- `packages/*` are consumed as TypeScript source via path aliases —
  no build/publish step. Each app's `tsconfig` extends a shared base.
- **Both apps must list every shared package in `transpilePackages`**
  (next.config) — Next.js does not compile TypeScript outside the app
  directory without it; missing entries fail the Vercel build with
  out-of-app syntax errors.
- **Exactly one `react`/`react-dom`/`next` version across the repo**,
  declared identically in both apps so npm hoists a single copy.
  Phase 0 acceptance includes `npm ls react` reporting one resolved
  version — a nested duplicate passes the build and crashes at runtime
  ("Invalid hook call").
- **Per-project Ignored Build Step on Vercel:** owner-app builds only on
  changes under `apps/owner-app/` or `packages/`; admin only on
  `apps/admin/` or `packages/`. Misconfiguring the packages/ trigger
  serves stale shared code — include it in both rules.
- Existing root scripts become thin delegates (`npm run dev -w owner-app`),
  with CI running typecheck/lint/test across all workspaces.

## 2. Data model additions

All new tables follow the existing migration conventions in
`packages/db` (ordered SQL migrations; Postgres-first semantics; note
apply-on-open is the SQLite dev path only — Postgres migrates solely via
`db:pg:migrate`). Existing tables (users, sessions, stores, oauth
identities, GBP accounts/locations, post drafts, publish attempts, audit
logs) are reused, not forked.

**Migration ownership across two apps:** with one database and two
independently-deploying apps, `db:pg:migrate` runs exactly once per
schema change — a named runbook step: the PM/founder runs it over the
direct URL _before merging_ any schema-bearing PR, and CI enforces
`db:pg:verify` so drift fails the pipeline. Never at app runtime.
CI-automated migration is deliberately deferred until the team grows. Every migration is **expand-contract**: additive changes
(new tables/columns, nullable first) land freely; renames, drops, and
new constraints on existing columns ship only after both apps run code
that no longer needs the old shape, one release later. This keeps the
not-yet-redeployed app serving correctly through every deploy window.

### Admin identity

```
admin_users        id, email (unique), password_hash, display_name,
                   role ('operator' | 'owner'), status, created_at
admin_sessions     id (opaque), admin_user_id, expires_at, created_at
```

- No public registration route. Admins are seeded by script/invite.
- Mirrors the owner session design (opaque DB-backed id, expiry) but in
  separate tables with a separate cookie name so a leaked owner session
  can never resolve to admin scope, and vice versa.

### CS chat

```
cs_conversations   id, store_id (FK stores), mode ('ai' | 'human'),
                   status ('open' | 'resolved'), assigned_admin_id NULL,
                   created_at, updated_at
cs_messages        id, conversation_id, sender ('owner' | 'assistant'),
                   author_kind ('user' | 'ai' | 'admin'),
                   author_admin_id NULL, body, created_at,
                   owner_read_at NULL, admin_read_at NULL
cs_message_context id, message_id, section, stage,
                   activity_trail (jsonb), captured_at
```

Boundary with the existing onboarding-conversation stack: `cs_*` tables
are deliberately separate from v1's `conversations` (different
lifecycle, different readers — onboarding turns are a bounded flow, CS
chat is open-ended with mode switching and read receipts). What is
shared lives once: reply composition, message-shape types, and the
OpenAI adapter sit in `packages/domain` / `packages/integrations` and
are consumed by both stacks. Neither duplicating composition logic into
the CS stack nor unifying the two tables is acceptable.

Key design point: `sender` is what the **owner sees** (always a single
"assistant" persona); `author_kind` is what **operations knows** (whether
the AI or a named admin actually wrote it). Switching `mode` on the
conversation changes who produces the next assistant message — the owner
experiences one continuous assistant with no seam.

Polling-path indexes ship in the same migrations as their tables — the
polling transport makes these the permanent hot path:
`cs_messages(conversation_id, id)` (cursor reads),
`cs_conversations(status, updated_at)` (inbox ordering),
`activity_events(store_id, created_at)` (store timeline),
`campaign_requests(status, updated_at)` (queue kanban).

### Activity telemetry

```
activity_events    id, store_id, session_id, section, action,
                   detail (jsonb, whitelisted keys only), created_at
```

- The owner app records screen/section transitions and named actions
  (e.g. `gbp_connect_started`, `campaign_upload_failed`) — never free
  text, keystrokes, or credential material (§7).
- The most recent N events (client-side ring buffer, ~20) are attached to
  each outgoing chat message as `cs_message_context.activity_trail`, and
  flushed periodically to `activity_events` for the dashboard's store
  timeline.

### Marketing material pipeline

```
campaign_requests  id, store_id, brief (text), status, created_at, updated_at
                   status: 'submitted' → 'in_production' → 'ready_for_review'
                           → 'approved' | 'changes_requested' | 'rejected'
                           → 'publishing' → 'published' | 'partially_published'
                           → 'failed'
campaign_assets    id, request_id, kind ('original' | 'processed'),
                   blob_url, content_type, width, height, meta (jsonb),
                   uploaded_by ('owner' | 'admin'), created_at
campaign_review_events
                   id, request_id, actor ('owner' | 'admin'),
                   decision ('go' | 'no_go' | 'changes_requested'),
                   note, created_at
publish_jobs       id, request_id, channel ('gbp' | 'instagram' | …),
                   status ('queued' | 'publishing' | 'published' | 'failed'),
                   external_ref NULL, attempt_count, last_error NULL,
                   idempotency_key, created_at, updated_at
```

- `publish_jobs` reuses the v1 publish-attempt semantics: idempotency key
  per (request, channel), history preserved, live actions blocked until
  the GBP location is verified (`src/gbp/state-machine.ts` logic moves to
  `packages/domain`).
- **Retry policy:** retries are operator-triggered (a dashboard action),
  never automatic — max 3 attempts per job, idempotency key held
  constant across attempts. After the third failure the job locks to a
  terminal failed state, the queue surfaces it, and the store's
  conversation gets an assistant message so the owner isn't waiting
  silently. Mirrors v1's ChannelPublishAction "manual follow-up after
  repeated failures" state.
- The state machine is enforced in `packages/domain` (single transition
  function), not scattered across route handlers — this is the
  "automation dial": each transition's trigger can later change from
  operator click to automated worker without touching the states.

### Organization publishing credentials

v1 publishes with the _owner's_ Google token and a single global
Instagram env token. v2 inverts this: the org account publishes to many
stores' GBP locations, and each store may link its own Instagram
business account. This is its own workstream, not a reuse:

```
org_credentials    id, provider ('google_org' | 'meta_app'),
                   encrypted_token, encrypted_refresh_token,
                   expires_at, scopes, updated_at
store_channel_links id, store_id, channel ('instagram' | …),
                   external_account_ref, encrypted_token NULL,
                   status ('linked' | 'expired' | 'revoked'), created_at
```

- Tokens encrypted with the existing `TOKEN_ENCRYPTION_KEY` mechanism;
  stored and used **only in the admin app** (owner app never reads
  them).
- Refresh handling is part of the publish path: an expired org token
  fails the job with a `blocked_by_credentials` result (v1 pattern),
  never a silent retry loop.
- **External lead times start now, not in Phase 3:** org Google account
  GBP OAuth client setup, and Meta app review for publishing on behalf
  of business accounts (historically weeks) are operations tasks that
  begin in week 1 alongside Phase 0.

### GBP organization access

```
gbp_access_requests id, store_id, gbp_location_ref, state
                    ('not_requested' | 'invited' | 'pending' | 'granted'
                     | 'revoked' | 'blocked'), requested_at, granted_at,
                    note
```

Tracks the org account's manager-access request per store. **In v2,
state transitions are operator actions** (audited via `audit_logs`) —
the grant itself is largely a Google-side flow the operator drives with
the owner over chat (the primary onboarding path). There is no
automated Google polling in v2; whether the GBP Account Management API
supports reliable automated grant detection is an open question pending
a spike (§9). The v1 location-verification state machine
(`src/gbp/state-machine.ts`) continues to gate _publishing_ eligibility
and is unrelated to this table.

## 3. Owner app v2 surface

Kept from v1 (moved, not rewritten): entry/login (Google primary; email
retained for development), onboarding shell, `MobileShell` layout system,
session handling, GBP OAuth + setup flow.

Changed:

- **Navigation reduces to:** Home/status, Marketing (intake + approvals),
  Reviews (stub), Performance (stub). The v1 post-composer UX
  (enhancement decisions, channel pickers) is removed from the owner
  surface — those decisions move to the dashboard.
- **Marketing intake:** upload 1–10 images + a short brief ("what and how
  to promote"). Creates a `campaign_request` in `submitted`. Owners see a
  status timeline per request and a **go/no-go review screen** when
  material returns as `ready_for_review` (approve, request changes with a
  note, or reject).
- **Chat widget:** floating button, bottom corner, on every authenticated
  screen; opens a side/overlay panel (mobile: full-height sheet). Follows
  DESIGN.md tokens. Sends messages with the activity-trail context;
  polls for replies (§5). One open conversation per store at a time.
- **Reviews & Performance:** existing components stay mounted on stub
  data. No new work; explicitly marked as stub in code and UI copy.

## 4. Admin dashboard surface

New Next.js app, desktop-first, same design tokens (dark canvas
`--canvas`, orange `--accent`) rendered as a dense operations theme —
visually a sibling of the owner app, not a clone of its mobile shell.

Sections:

1. **Stores** — list + detail: owner identity, GBP connection state
   (`gbp_access_requests`), activity timeline (`activity_events`), open
   conversation, campaign history.
2. **Inbox (chat console)** — conversation list ordered by
   awaiting-reply; conversation view shows messages **plus the context
   panel**: the section/stage the owner was on for each message and the
   recent-action trail, so operators diagnose without asking. Controls:
   AI/human mode toggle (per conversation), assign-to-me, resolve.
   In AI mode the console shows AI replies as they happen; an operator
   flipping to human mode takes over mid-conversation.
3. **Production queue (campaigns)** — kanban by `campaign_requests.status`.
   Operators open a request, view originals + brief, upload processed
   assets, write final copy, and move it to `ready_for_review` (which
   notifies the owner app). After owner `go`, the publish panel creates
   `publish_jobs` per selected channel and shows per-channel status/history.
4. **Settings** — admin user management (owner role only), integration
   diagnostics (reusing the v1 diagnostics pattern).

## 5. Chat transport: polling

Decision (founder-confirmed): **polling**, no realtime vendor.

- Owner widget polls `GET /api/chat/messages?after=<cursor>` every 3s
  while the panel is open, 30s while closed (badge only).
- Dashboard inbox polls a summary endpoint every 5s; an open conversation
  polls at 3s.
- Rationale: Vercel serverless + Neon pooling make long-lived connections
  and `LISTEN/NOTIFY` unavailable; CS chat at 10–20 stores tolerates
  seconds of latency; zero new vendors or credentials.
- The message store never assumes push. If/when scale demands it, a
  managed realtime layer (e.g. Pusher/Ably) is added as a notification
  hint on top of the same tables — clients still reconcile via the cursor
  endpoint, so no migration.

### AI responder

When a conversation is in `ai` mode, the message-create handler persists
the owner's message and returns immediately — composition never runs
inside the owner's POST. The reply (or operator-facing draft, per the
"AI drafts, operator sends" posture) is composed out-of-band via
`waitUntil` through the existing OpenAI adapter boundary
(`openai-conversation.ts` pattern), with a system prompt built from: store
profile, GBP connection state, campaign statuses, and the message's
activity trail. The owner's polling loop delivers the reply on the next
tick, so send latency is independent of OpenAI latency and a failed
composition can never make the owner's send ambiguous. Stub mode returns deterministic canned replies so chat is
fully demoable without credentials. AI failures degrade to a polite
"the team will get back to you" assistant message and flag the
conversation in the dashboard — never a silent drop.

## 6. Media storage

Owner photo uploads and operator-processed assets go to **Vercel Blob**
(private access; time-limited signed URLs rendered to clients).
Rationale: zero-config on the existing Vercel stack, no AWS account or
credential surface. Wrapped behind a small `MediaStore` contract in
`packages/integrations` (stub implementation = local filesystem under a
temp dir) so tests and stub mode never touch the network, and S3 remains
a swap-in if egress economics change. Upload limits: 10 images/request,
10MB/image, content-type whitelist (jpeg/png/webp/heic).

**Instagram publish URLs:** Meta's Graph flow fetches the post image
from a URL you provide. The publish path mints a fresh signed URL with
a ~1 hour TTL per publish attempt (each retry mints its own) — the
asset stays private at rest, and the temporary readability window
covers content that is about to be public anyway.

**Uploads are client-direct, never through a route handler** — Vercel
functions cap request bodies at 4.5MB, below a typical phone photo. Flow:
the route handler authenticates the owner, enforces per-request limits,
and issues a short-lived scoped Blob client token; the browser uploads
straight to Blob; the upload callback registers the `campaign_assets`
row, where the server re-validates content type and size before the
asset becomes visible to the pipeline. The stub `MediaStore` mimics the
token flow against the local filesystem so the client code path is
identical in tests.

## 7. Security & privacy

- **Session isolation:** separate cookie names, separate tables, separate
  apps. Admin routes verify admin sessions only; owner routes verify owner
  sessions only. No route accepts both.
- **Org credentials live only in the admin project's env.** The owner app
  never holds organization GBP/platform tokens. Publishing executes in
  admin-app route handlers.
- **Ownership enforcement is unchanged:** every owner API route scopes by
  session → store ownership (v1 pattern, moves to `packages/db`
  repositories). Admin routes log actor + action to the existing
  `audit_logs` table for every state transition (mode switches, review
  decisions, publishes).
- **Telemetry minimization:** activity events record screen/section IDs
  and named action constants from a fixed enum — no free text, no
  keystrokes, no request/response bodies, no tokens. The enum lives in
  `packages/domain` so additions are reviewable.
- **Token handling:** provider tokens stay encrypted with
  `TOKEN_ENCRYPTION_KEY` (v1 mechanism). Blob URLs are signed and
  short-lived. Secrets never appear in logs, comments, or stub fixtures.
- **Rate limiting:** message-create and upload endpoints reuse the v1
  auth-rate-limit table pattern per store.

## 8. Integration boundary (unchanged philosophy)

`createIntegrationAdapters()` remains the single seam. v2 adds contracts
for: `MediaStore`, `CsAssistant` (AI reply composition), and
`ChannelPublisher` extensions for the multi-platform publish jobs. Every
new contract ships with a deterministic stub first; production
implementations land only when credentials exist. Vercel preview
fallbacks (stub-when-uncredentialed) extend to the new adapters.

## 9. Open questions (tracked, non-blocking)

- Automated GBP manager-grant detection: spike the GBP Account
  Management API (invitation/admin endpoints, quota, org-account
  constraints — including Google's restrictions on newly granted
  managers) before promising any automation beyond operator-tracked
  state. Also determines whether Phase 4's grant flow can ever be fully
  self-serve.
- Custom domain + IP allowlisting/SSO for the admin app before real
  customer data flows (target: before first paying cohort).
- Push notification for owners when material hits `ready_for_review`
  (v2 ships in-app badge + chat message; email/Kakao alert is a fast
  follow).
- Instagram publishing for stores without a linked IG business account —
  dashboard should show per-channel eligibility before operators queue
  jobs (reuses v1 eligibility checks).
