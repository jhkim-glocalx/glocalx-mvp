# GlocalX v2 — Program Overview

Status: Proposed (founder-approved direction, engineering plan pending review)
Date: 2026-07-16
Audience: founders, investors, and the engineering team. Sections 1–4 are
investor-readable; sections 5+ and the linked documents are the developer
contract.

## Document set

| Document                                          | Audience         | Purpose                                                  |
| ------------------------------------------------- | ---------------- | -------------------------------------------------------- |
| This file                                         | Everyone         | Vision, scope, operating model, success criteria         |
| [architecture.md](architecture.md)                | Engineering      | Deployment topology, data model, API contracts, security |
| [delivery-plan.md](delivery-plan.md)              | Engineering / PM | Phased milestones, task breakdown, acceptance criteria   |
| Pitch deck (`01_documents/glocalx-v2-pitch.pptx`) | Investors        | Narrative version of this program                        |

## 1. What changes in v2

v1 tried to put the full marketing automation loop inside the owner-facing
app: extraction, GBP setup, AI post generation, image handling, and
publishing. v2 deliberately splits the product in two:

- **Owner app (v2)** — a minimal, mobile-first surface. Owners log in with
  Google, connect their Google Business Profile so the GlocalX organization
  account can request manager access, talk to an assistant through a chat
  widget, and submit marketing material (photos + a short description of
  what to promote). They approve or reject finished material. Nothing else.
- **Admin dashboard (new)** — an internal operations console. The team sees
  every store, every conversation, and every marketing request. Operators
  process raw owner photos into posting-ready material, send it back for
  owner approval, and publish approved material to multiple platforms from
  the organization account. Chat can run in **AI mode** (automated
  responses) or **human mode** (a real operator replies) — the owner always
  experiences one continuous assistant.

The review and performance sections of the owner app remain visible but
**stub-backed**. They are future workstreams and are explicitly out of
scope for v2 delivery.

## 2. Why concierge operations first

This is a deliberate "concierge MVP" strategy:

- **Learning per customer is maximized.** Every marketing request flows
  through a human operator, so we see exactly which enhancement decisions,
  copy edits, and channel choices matter before encoding them in software.
- **Scope collapses.** The owner app drops image-editing UX, enhancement
  decision flows, and channel configuration — the hardest and least-validated
  surfaces of v1.
- **Automation is a dial, not a rewrite.** The dashboard is built around
  queues and state machines. Each manual step (chat reply, image
  enhancement, channel publishing) can be flipped to automated
  independently, per store, as confidence grows. The AI/human chat toggle
  is the first instance of this pattern.
- **The v1 codebase is reused, not discarded.** Auth, GBP setup
  orchestration, the publish pipeline (GBP + Instagram), the OpenAI
  adapters, and the stub/production integration boundary all carry over.

## 3. The v2 loop (end to end)

```
Owner                          System                        Operations
─────                          ──────                        ──────────
Google login ──────────────▶ OAuth + session
Connect GBP ───────────────▶ org access request ──────────▶ track/assist grant
                                                             (manager access)
Chat (corner widget) ──────▶ conversation + context ──────▶ AI mode: auto-reply
  · carries activity trail     telemetry                     Human mode: operator
                                                             replies in console
Upload photos + brief ─────▶ campaign request queue ──────▶ operator produces
                                                             posting-ready material
Go / No-go review ◀──────── ready-for-review material ◀───┘
      │ go
      ▼
                             publish jobs ────────────────▶ operator triggers
                                                             multi-platform publish
Published confirmation ◀──── per-channel status              (GBP, Instagram, …)
```

Two properties of the loop matter most:

1. **Owner approval gates publishing.** Nothing goes live without an
   explicit go from the owner (carried over from v1's approval policy — no
   fully automatic posting).
2. **Context-rich support.** Every chat message carries what the owner was
   doing and where they are stuck (screen, stage, recent actions), so an
   operator can diagnose without asking "what do you see?".

## 4. Success criteria for v2

- A new store owner completes Google login → GBP connect → org access
  granted with zero engineer involvement.
- A marketing request goes from owner upload to multi-platform publish in
  under one business day, with the owner touching only upload and go/no-go.
- One operator comfortably handles the initial customer cohort (~10–20
  stores) from the dashboard alone.
- Chat mode can be switched per conversation between AI and human with no
  visible seam to the owner.
- Everything ships behind the existing stub/production adapter boundary so
  demos and QA never require live credentials.

## 5. Scope summary (engineering)

In scope:

- Monorepo restructure: `apps/owner-app` (existing app), `apps/admin`
  (new), shared `packages/*` for DB, domain logic, and integrations. Two
  Vercel projects sharing one Neon Postgres.
- Admin authentication (invite-only, role-based) with its own session
  system — no shared cookies with the owner app.
- CS chat: floating widget in the owner app, conversation console in the
  dashboard, polling transport, per-conversation AI/human mode, activity
  context attached to messages.
- Activity telemetry: section/stage breadcrumbs from the owner app.
- Marketing material pipeline: owner intake (images + brief) → dashboard
  production queue → ready-for-review → owner go/no-go → publish jobs per
  channel with history.
- GBP organization-access onboarding: connect Google account, track
  manager-access request state through grant.

Out of scope (explicitly):

- Live review retrieval/reply and real performance analytics (stay stubbed).
- Automated image enhancement (operators use their own tools in v2).
- Payments, billing, subscription management.
- Realtime infrastructure (websockets/managed realtime) — polling is the
  v2 transport; the message store is transport-agnostic so this can change
  later without a data migration.
- Naver SmartPlace posting and paid ad execution (unchanged from v1 scope).

## 6. Operating model

- **Claude** specifies, implements, tests, verifies, and ships.
  **Codex** provides an independent second opinion on demand (design
  sanity checks, `/codex review`) — it does not implement (see
  `CLAUDE.md`).
- Git flow is GitHub Flow: `feat/*` PRs directly into `main`
  (production), with per-PR Vercel previews serving as staging — the
  `dev` branch is retired by `feat/social-post-publishing`. The admin
  app gets its own Vercel project wired to the same flow.
- `APP_INTEGRATION_MODE=stub` remains the default for development, review,
  and demos in **both** apps.

## 7. Risks and mitigations

| Risk                                                   | Mitigation                                                                                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo restructure destabilizes the working v1 app   | Phase 0 moves code with zero behavior change, gated by the full existing test suite + e2e before anything new lands                    |
| GBP manager-access grants stall (Google-side friction) | Dashboard tracks request state explicitly; operators chase via chat; state machine treats "pending" as a first-class, long-lived state |
| Operator load grows past one person                    | Queues expose per-stage timing from day one; the automation dial (AI chat, later auto-enhancement) is the designed relief valve        |
| Chat polling costs / latency disappoint                | Message store is transport-agnostic; swapping polling for managed realtime is a client change, not a schema change                     |
| Owner-app telemetry raises privacy concerns            | Trail records screen/stage/action names only — never keystrokes, message bodies, or credentials; documented in architecture.md §7      |
