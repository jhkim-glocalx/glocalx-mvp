# GlocalX v2 — Delivery Plan

Status: Proposed
Date: 2026-07-16
Companion docs: [README.md](README.md) (scope), [architecture.md](architecture.md) (design)

Working model: Claude (PM) writes scoped task specs, Codex implements,
PM verifies (diff review + `/qa` + test suite) and ships via GitHub
Flow — `feat/*` branches PR directly into `main`, with per-PR Vercel
previews as staging (the `dev` branch is retired by
`feat/social-post-publishing`, which must merge before Phase 0). Each
phase below is sized to land as a small number of reviewable PRs, each
independently shippable behind the stub adapter boundary.

## Phase map

| Phase | Outcome | Depends on | Est. |
| --- | --- | --- | --- |
| 0 | Monorepo restructure, admin scaffold, admin auth | — | 1 wk |
| 1 | Chat MVP: widget + console + context telemetry (human mode) | 0 | 1.5 wk |
| 2 | AI responder + AI/human mode toggle | 1 | 1 wk |
| 3 | Marketing pipeline: intake → production → go/no-go → publish | 0 (parallel w/ 1–2) | 2 wk |
| 4 | GBP org-access onboarding hardening | 0 | 1 wk |
| 5 | Staging cohort readiness: seed, ops docs, QA pass | 1–4 | 0.5 wk |

Phases 1–2 (chat) and 3 (pipeline) are parallelizable workstreams after
Phase 0. Total: ~5–6 calendar weeks with the current team.

The timeline is tentative by design: it flexes with pilot-store
recruitment and build progress. The manual-serve track (Phase 0
parallel workstream) is the steering signal — evidence from it (grant
friction, request volume, response behavior) adjusts phase ordering and
scope continuously rather than at a single fixed checkpoint.

---

## Phase 0 — Foundation (zero behavior change)

Goal: the repo becomes a workspace monorepo with the admin app deployed,
while the owner app behaves byte-for-byte identically.

Tasks:

1. **Workspace restructure.** Move the existing app to `apps/owner-app`;
   create `packages/db`, `packages/domain`, `packages/integrations`,
   `packages/ui` and relocate `src/server/db`, `src/domain`,
   `src/integrations`, and design tokens respectively. Path-alias only,
   no build step. Root scripts delegate to workspaces.
2. **Admin scaffold.** `apps/admin`: Next.js app (same pinned canary),
   dark ops theme from `packages/ui` tokens, health route, empty
   sections (Stores / Inbox / Queue / Settings).
3. **Admin auth.** `admin_users` + `admin_sessions` migrations, seed
   script for the first admin, login page, session middleware, logout.
   No public registration.
4. **Vercel wiring.** Second Vercel project rooted at `apps/admin`,
   Postgres env configured; existing project re-rooted to
   `apps/owner-app`. Branch mapping follows GitHub Flow (`main` →
   production, per-PR previews) — `feat/social-post-publishing` retires
   the `dev` branch and must merge before this phase. Per-project
   Ignored Build Step rules per architecture.md §1.
5. **Dual-app e2e harness.** Root Playwright config with two `webServer`
   entries (owner-app + admin on distinct ports, one stub SQLite file
   per run); cross-app specs live in `tests/e2e-cross/`; existing
   single-app suites unchanged.

Parallel workstream (owner: founder, not engineering): serve 2-3
friendly stores manually from week 1 — v1 app plus operator hands —
logging every Kakao exchange (message/reply timestamps, approval
outcomes) with the same metric definitions as Phase 1's widget
instrumentation. Real requests become the dashboard's test data; the
logged exchanges become the premise-2 comparison baseline.

Acceptance criteria:

- Full existing suite green from the repo root: `typecheck`, `lint`,
  `test`, `build`, `e2e` (stub mode) — proving the move changed nothing.
- `npm ls react` resolves exactly one React across the workspace.
- Admin login round-trip works on a Vercel preview against staging
  Neon; owner session cookie cannot access any admin route and vice
  versa (covered by a route test).
- A trivial cross-app spec passes under the dual-app harness.
- `npm run db:pg:verify` passes with the new migrations.

Overrun rule: if the split exceeds one week, cut the packages
extraction to `packages/db` only (admin imports domain/integrations via
path alias temporarily) and defer the rest to a cleanup PR.

## Phase 1 — Chat MVP (human mode)

Goal: an owner can message from the corner widget; an operator replies
from the dashboard inbox; every message carries activity context.

Tasks:

1. **Migrations:** `cs_conversations`, `cs_messages`,
   `cs_message_context`, `activity_events`.
2. **Activity trail hook** in the owner app: fixed action enum in
   `packages/domain`, client ring buffer, periodic flush endpoint.
3. **Owner chat widget:** floating button + panel per DESIGN.md
   (mobile sheet / side panel ≥680px), message list, composer, unread
   badge; 3s open / 30s closed polling with cursor endpoint.
4. **Owner chat API:** create-message (attaches trail context, rate
   limited), list-messages (cursor), mark-read. Store-scoped ownership
   enforcement throughout.
5. **Dashboard inbox:** conversation list (awaiting-reply first, 5s
   poll), conversation view with **context panel** (per-message
   section/stage + recent-action trail), reply composer, assign-to-me,
   resolve. Replies write `author_kind='admin'`, rendered to the owner
   as the assistant.
6. **Audit:** operator replies and resolutions logged to `audit_logs`.

Acceptance criteria:

- E2E (stub, both apps running): owner sends message from the Marketing
  screen → operator inbox shows it within 5s **with** section/stage
  context → operator reply appears in the widget within 5s → unread
  badges clear on read.
- Trail contains only enum'd actions (schema-validated); a message sent
  while stuck on the GBP-connect screen visibly shows that in the console.
- Unit coverage: conversation repository, context attachment, cursor
  pagination, rate limit.
- Kill-metric instrumentation (premise 2, [design-decisions.md](design-decisions.md)): weekly
  activation, median owner response time, and owner-initiated
  conversation count computed from `cs_messages`, `activity_events`,
  and `cs_conversations` — each computation unit-tested against fixture
  data (a broken metric silently corrupts the week-4 premise decision).
  Approval-completion metric activates in Phase 3.

## Phase 2 — AI mode + seamless handoff

Goal: conversations start in "AI drafts, operator sends" posture;
autonomous AI mode is a per-conversation flip once draft quality is
trusted; operators can take over (and hand back) invisibly to the owner.

Tasks:

1. **`CsAssistant` adapter contract** + deterministic stub + OpenAI
   production implementation (system prompt from store profile, GBP
   state, campaign statuses, message trail).
2. **Draft posture:** a `draft` status on `cs_messages` (AI-composed,
   never owner-visible) + console draft review/edit/send surface. AI
   composition runs out-of-band after the owner's message persists
   (architecture.md §5) — never inside the owner's POST. Mode toggle:
   per-conversation switch between `ai_draft` (default) and autonomous
   `ai`; failures degrade to a courteous fallback message + dashboard
   flag (never silent).
3. **Handoff semantics:** flipping to human stops AI replies immediately;
   flipping back resumes. Console renders AI vs admin authorship
   distinctly; the owner sees one assistant.

Acceptance criteria:

- Stub-mode E2E: AI conversation produces deterministic replies; mid-
  conversation toggle to human suppresses AI for the next message; owner
  transcript shows a single continuous assistant.
- Adapter request-spec tests for the production OpenAI path (no live
  calls), matching the v1 request-spec pattern.
- Forced-failure test: AI error yields fallback message + flagged
  conversation, and the owner never sees an error state.
- Draft-visibility test: `draft`-status rows never appear in any
  owner-facing read (list-messages, unread counts, badges) — this seam
  is the entire one-assistant illusion.

## Phase 3 — Marketing material pipeline

Goal: the full loop — owner uploads, operators produce, owner approves,
dashboard publishes to multiple platforms.

Tasks:

1. **Migrations:** `campaign_requests`, `campaign_assets`,
   `campaign_review_events`, `publish_jobs`; single transition function
   in `packages/domain` with exhaustive state-machine tests.
2. **`MediaStore` contract:** Vercel Blob production impl + filesystem
   stub; signed-URL rendering; upload limits (10 files, 10MB,
   image-type whitelist).
3. **Owner intake screen:** image upload + brief → `submitted`; request
   status timeline list (replaces the v1 composer surface; Reviews/
   Performance stay stubbed and labeled).
4. **Dashboard production queue:** status kanban; request detail with
   originals + brief; processed-asset upload + final copy; move to
   `ready_for_review`.
5. **Owner go/no-go screen:** rendered final material; approve / request
   changes (with note) / reject; decisions recorded to
   `campaign_review_events` and surfaced in the queue.
6. **Publish panel:** per-channel eligibility (reusing v1 GBP
   verification gates + Instagram linkage checks), `publish_jobs` with
   idempotency keys via the existing publish pipeline, per-channel
   status/history, operator-triggered retry (max 3, per
   architecture.md §2).
7. **Org credential plumbing** (architecture.md "Organization publishing
   credentials"): `org_credentials` + `store_channel_links` migrations,
   encrypted storage, publish-path refresh handling with
   `blocked_by_credentials` results. NOTE: the external prerequisites —
   org Google OAuth client + Meta app review — are week-1 operations
   tasks; Phase 3's publish acceptance runs in stub mode regardless, but
   live publishing waits on them.
8. **Chat linkage + operator nudge:** status changes post an assistant
   message to the store's conversation ("Your material is ready to
   review"). Because v2 has no out-of-app notification, the queue also
   tracks an explicit nudge step on `ready_for_review` — the operator
   personally notifies the owner on their existing channel and marks it
   done; the <1-business-day promise depends on this step, and Kakao
   notify (v2.1) is the automation of exactly it.

Acceptance criteria:

- Stub-mode E2E of the entire loop: upload → in_production →
  ready_for_review → go → published on two channels, with history
  visible in both apps; no_go path returns the request to production
  with the owner's note attached.
- State machine rejects illegal transitions (unit-tested exhaustively);
  publishing is impossible before owner `go` (route + domain test).
- Replayed publish requests are idempotent per (request, channel).
- Double-submit test: rapid duplicate go/no-go actions create exactly
  one `campaign_review_events` row and at most one publish job per
  channel.
- Stale-screen test: approving a request whose status changed underneath
  (e.g. moved to `changes_requested` while the owner viewed it) is
  rejected by the transition function with a clear owner-visible message.
- Upload re-validation test: asset registration rejects oversize and
  non-whitelisted content types server-side even when the client token
  flow was bypassed or abused.
- Retry-cap tests: 3rd failed attempt locks the job terminal, holds the
  idempotency key constant across attempts, and posts the chat
  notification (per architecture.md §2 retry policy).
- Blob URLs in client responses are signed and expire; originals are
  never publicly listable.

## Phase 4 — GBP org-access onboarding

Goal: the app's core onboarding promise — Google login, GBP connect, org
manager access — is a tracked, resumable flow.

Tasks:

1. **Migration:** `gbp_access_requests` with operator-driven, audited
   transitions (no automated Google polling in v2 — see
   architecture.md; the v1 verification state machine keeps gating
   publish eligibility only).
2. **Owner connect flow:** post-login GBP connect screen (reusing v1
   GBP OAuth) → org access request state visible to the owner
   (`invited/pending/granted`), with a "we're on it" state instead of
   dead ends; stuck states deep-link into chat. **Operator-assisted
   grant via chat is the primary path for the first cohort** (design
   doc premise 1, [design-decisions.md](design-decisions.md)); the
   self-serve flow is the scaling path.
3. **Dashboard visibility:** per-store connection status, chase notes,
   manual state override with audit logging (for out-of-band grants).

Acceptance criteria:

- Stub-mode E2E: new owner reaches `granted` via simulated transitions;
  every intermediate state renders correctly in both apps.
- A stalled `pending` store is visible in the dashboard Stores list with
  age; operator note + override are audited.
- Existing v1 GBP setup tests still pass against the relocated domain code.

## Phase 5 — Cohort readiness

- Seed script producing a realistic demo dataset (stores in each pipeline
  state) for staging and investor demos.
- Operator runbook (`docs/v2/ops-runbook.md`): daily queue workflow, chat
  SLAs, publish checklist, incident basics.
- Full `/qa` pass on both apps (staging, stub mode), fix cycle, then
  production cutover checklist (env matrix for both Vercel projects,
  migration order, rollback posture per the existing deployment docs).

---

## Verification gates (every phase)

1. Codex diff review against the task spec (PM).
2. `npm run typecheck && npm run lint && npm run test` green at root.
3. `npm run e2e` (stub) green; new flows get e2e coverage in the same PR.
4. `/qa` browser pass on the affected surfaces (both apps when touched).
5. Postgres migration verified via `db:pg:verify` and a Vercel preview
   before merging to `main`.

## Deliverables checklist

- [ ] Phase 0–5 landed on `main`, both Vercel projects serving production.
- [ ] `docs/v2/` kept current with any in-flight design changes.
- [ ] Operator runbook delivered and dry-run with a founder.
- [ ] Investor pitch deck (`01_documents/glocalx-v2-pitch.pptx`).
- [ ] Demo dataset + scripted walkthrough for investor/customer demos.

## Review appendix (2026-07-17 engineering review)

### NOT in scope (considered and deferred, with rationale)

- Live review retrieval/reply + performance analytics — stub-backed;
  next workstream after v2 (founder scope decision).
- Automated image enhancement — operators use their own tools; the
  manual step is the learning mechanism (concierge thesis).
- Realtime chat infrastructure — polling suffices at cohort scale;
  message store is transport-agnostic (D2 decision, re-confirmed).
- KakaoTalk notify — v2.1 fast-follow, pre-staged in TODOS.md #3,
  triggered by kill-metric evidence (D7/D28/D33).
- Automated GBP grant detection — operator-tracked state only; API
  spike is TODOS.md #2 (D25/D32).
- Admin access hardening beyond invite-only auth — consciously skipped
  for now (D34); revisit before real customer data.
- CI-automated migrations — named runbook step instead until the team
  grows (D29).
- Payments/billing, Naver SmartPlace posting, paid ads — unchanged v1
  exclusions.

### What already exists (reused vs rebuilt)

- Publishing pipeline (GBP + Instagram, idempotent, history) — REUSED;
  lives on `feat/social-post-publishing`, must merge before Phase 0.
  Credential model is NOT reusable as-is (owner tokens → org tokens):
  new workstream, architecture.md "Organization publishing credentials".
- GBP location-verification state machine — REUSED to gate publishing;
  explicitly NOT the driver of `gbp_access_requests`.
- OAuth + opaque sessions + rate limiting + audit_logs — REUSED
  (admin gets parallel tables, same patterns).
- Onboarding conversation stack — kept separate from CS chat;
  composition/types/adapter shared once via packages (D19).
- Stub/production adapter boundary — REUSED and extended (MediaStore,
  CsAssistant).

### Failure modes audit

All new codepaths have a test + handling + user-visible error after the
review amendments (issues 3, 6, 8; OV-5, OV-8). Remaining silent path:
orphaned Blob objects from abandoned uploads — harmless cost leak,
captured as TODOS.md #4. **Critical gaps: 0.**

### Worktree parallelization

| Step | Modules touched | Depends on |
|------|----------------|------------|
| Phase 0 split + harness | everything (move), root configs | — |
| Chat (Ph 1-2) | apps/* chat, packages/domain (cs), db migrations | Phase 0 |
| Pipeline (Ph 3) | apps/* campaign, packages/integrations, db migrations | Phase 0 |
| GBP access (Ph 4) | apps/* gbp screens, db migration | Phase 0 |

Lanes after Phase 0: **Lane A** chat (Ph 1→2 sequential), **Lane B**
pipeline (Ph 3), **Lane C** GBP access (Ph 4). A and B are parallel
worktree candidates. Conflict flags: all lanes append ordered
migrations in `packages/db` — allocate migration numbers per lane up
front; A and B both touch `packages/domain` — keep cs/* and campaign/*
modules disjoint. Launch A + B in parallel, C after either merges.

### Implementation tasks

Synthesized from review findings; JSONL artifact for /autoplan at
`~/.gstack/projects/jhkim-glocalx-glocalx-mvp/tasks-eng-review-20260717-151214.jsonl`.

- [ ] **T1 (P1, human: ~1d / CC: ~1h)** — test-infra — dual-app Playwright harness (Issue 7)
- [ ] **T2 (P1, ~1d / ~1h)** — media — client-direct Blob uploads + registration re-validation (Issue 2)
- [ ] **T3 (P1, ~3d / ~3h)** — credentials — org_credentials + store_channel_links + refresh handling; Meta review & org OAuth kickoff week 1 (OV-1)
- [ ] **T4 (P2, ~1d / ~1h)** — chat — persist-then-compose via waitUntil + draft status + console draft surface (Issue 3)
- [ ] **T5 (P2, ~0.5d / ~30m)** — monorepo — transpilePackages, single-React check, Ignored Build Steps (Issue 1)
- [ ] **T6 (P2, ~0.5d / ~30m)** — db — migration runbook + CI db:pg:verify gate (Issue 4, OV-6)
- [ ] **T7 (P2, ~0.5d / ~45m)** — publish — operator-triggered retry cap + tests (Issue 6)
- [ ] **T8 (P2, ~0.25d / ~15m)** — db — polling-path indexes in table migrations (Issue 9)
- [ ] **T9 (P2, ~2d / ~1h)** — tests — six coverage additions (Issue 8)
- [ ] **T10 (P2, ~0.5d / ~30m)** — ops-queue — nudge tracking on ready_for_review (OV-5)
- [ ] **T11 (P3, ~0.25d / ~15m)** — publish — IG publish-time signed URL, 1h TTL (OV-8)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 9 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CROSS-MODEL:** Outside voice (Claude subagent; Codex timed out) found 8 additional findings — 7 accepted and folded (org credential workstream, GBP grant reframe, doc self-containment, operator nudge, migration runbook, IG signed URL, dev-branch erratum), 1 sequencing challenge resolved as "keep parallel-serve, timeline explicitly tentative" (D26). Office-hours design doc (docs/v2/design-decisions.md) additionally carried a Codex cold read whose challenge produced the premise-2 kill metrics.
- **VERDICT:** ENG CLEARED — 17 findings total (9 review + 8 outside voice) all resolved and folded into the plan; ready to implement pending `feat/social-post-publishing` merge.

NO UNRESOLVED DECISIONS
