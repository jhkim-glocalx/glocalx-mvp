# Operator runbook — GlocalX v2

> **한국어:** [ops-runbook.ko.md](ops-runbook.ko.md)

The daily playbook for the person running the operator console
(`apps/admin`, the dark "GlocalX Ops" dashboard). It covers the three
consoles an operator lives in — **Queue**, **Inbox**, **Stores** — plus
the publish checklist and incident basics.

v2 is a **concierge** product: almost every state advances because an
operator moved it, not because a job did. There is no automated Google
polling, no push channel, and (today) no live integrations — the whole
system runs on deterministic stubs (`APP_INTEGRATION_MODE=stub`), so in
staging every "publish" and "grant" is simulated. That is by design; the
manual step is the learning mechanism.

## Console access

Invite-only. There is no registration route — seed each operator from a
shell:

```bash
ADMIN_SEED_EMAIL=ops@glocalx.example ADMIN_SEED_PASSWORD='a-strong-password' \
ADMIN_SEED_NAME='Operator Name' ADMIN_SEED_ROLE=OPERATOR \
npm run seed:admin -w apps/admin
```

Admin sessions are separate from owner sessions and never resolve across
apps. Owner (`apps/owner-app`) and admin (`apps/admin`) share one database.

## The demo dataset (dry-run before you touch real stores)

`npm run db:reset && npm run db:seed` (SQLite locally, or `db:pg:seed` on
staging) loads the Phase 5 cohort — one store parked in every state each
console renders, so you can rehearse every action against a known store:

| Store                              | Queue                              | Stores (GBP access) | Inbox             |
| ---------------------------------- | ---------------------------------- | ------------------- | ----------------- |
| 브런치모먼트 홍대점 (`demo-store`) | Settled (published, both channels) | — (e2e-owned)       | —                 |
| 김밥천국 신촌점                    | — (onboarding IN_PROGRESS)         | not requested       | open (human)      |
| 동네빵집 망원점                    | Submitted                          | Invited             | —                 |
| 헤어살롱 연남점                    | In production                      | Pending             | AI draft (unsent) |
| 필라테스 합정점                    | Awaiting owner (nudged)            | Granted             | —                 |
| 분식상회 상수점                    | Publishing (partially published)   | Granted             | —                 |
| 카페 홍대입구점                    | Changes requested                  | Blocked             | flagged handoff   |

---

## Queue — the campaign pipeline

A store's marketing request moves left-to-right across the kanban. Each
card is one `campaign_request`; the column is its status.

| Column                | Status                               | What it means                                   | Your move                                              |
| --------------------- | ------------------------------------ | ----------------------------------------------- | ------------------------------------------------------ |
| **Submitted**         | `submitted`                          | Owner sent a brief (+ any originals).           | Pick it up: move to production and start the creative. |
| **In production**     | `in_production`                      | You are producing the material.                 | Upload processed assets, write the final copy.         |
| **Awaiting owner**    | `ready_for_review`                   | Material is ready; the owner must say go/no-go. | **Nudge the owner** (see below), then wait.            |
| **Changes requested** | `changes_requested`                  | Owner asked for edits.                          | Read the note, revise, move back to production.        |
| **Publishing**        | `publishing` / `partially_published` | A publish is in flight or one channel failed.   | Retry the failed channel, or investigate.              |
| **Settled**           | `published` / `rejected` / `failed`  | Terminal.                                       | Nothing — it's done.                                   |

### The owner nudge (why "Awaiting owner" needs you)

v2 has **no push channel**. A request sitting in `ready_for_review` does
not move until you personally message the owner on the channel they
already use (KakaoTalk, phone) and tell them material is ready. The queue
tracks this: a card shows **"Owner notified …"** once you record the
nudge, and the timestamp clears on every status change (the nudge belongs
to the state the owner is in _now_). A card in Awaiting owner with **no**
nudge timestamp is your top priority — the owner does not yet know they
owe you a decision.

_Demo:_ 필라테스 합정점 sits in Awaiting owner already nudged.

### Publishing and the retry cap

Publish is per-channel (GBP, Instagram). GBP publishes from the
**organization** Google credential, not the owner's token, so an org
credential must exist or the channel is blocked (the panel says why rather
than greying out silently). A channel that fails is **operator-retried,
never automatic**, and locks terminal after **3 attempts**
(`publishJobMaxAttempts`). A request where one channel published and the
other failed is **partially published** — retry the failed channel from
its card.

_Demo:_ 분식상회 상수점 published on GBP but its Instagram link is
`expired`, so Instagram failed (3 attempts) → partially published.

### Publish checklist

1. Status is `approved` (owner said go) or you are retrying a failed
   channel.
2. For GBP: the store's GBP access is **Granted** and the location is
   **VERIFIED** (Stores console), and an org Google credential exists.
3. For Instagram: the store's channel link is `linked` (not `expired` /
   `revoked`).
4. Final copy is written and reviewed.
5. Publish the channel; confirm the card shows the external ref and moves
   to published. If it fails, read `last_error`, fix the cause, retry
   (remember the 3-attempt cap).

---

## Inbox — customer support chat

One open conversation per store at a time. The owner always sees a single
"assistant" persona; you decide who actually writes each reply.

### Mode (per conversation)

- **Human** — you write every reply. The concierge default.
- **AI draft** — the AI composes a reply but it is **never sent to the
  owner until you press Send draft**. Review, edit, or discard it. This is
  the one-assistant seam: the owner never sees an unsent draft.
- **AI auto** — the AI replies directly (use sparingly, only for
  well-understood flows).

### Handoff and flags

A conversation flagged **⚑** needs a human — an AI composition failed, or
the owner is stuck in a way automation cannot resolve. Flagged threads are
your first stop. Take it with **Assign to me**, resolve the owner's
problem, then **Resolve** to free the store's conversation slot.

_Demo:_ 헤어살롱 연남점 is in AI draft with an unsent draft waiting; 카페
홍대입구점 is flagged (owner blocked on their GBP invite).

### Suggested SLAs (cohort scale)

- **Flagged / handoff:** respond within **1 business hour**.
- **New owner message (human mode):** first reply within **4 business
  hours**.
- **AI draft awaiting review:** clear the draft queue at least **twice a
  day**; never let a draft sit past end of day.
- **Resolve** a conversation once the owner's issue is closed so the next
  one can open.

---

## Stores — GBP organization access

The Stores console works the `gbp_access_requests` table: the manager
access the org needs on each store's Google Business Profile before it can
publish. **Every hop is operator-driven** — there is no Google polling, so
the state reflects what you know, and the buttons offered are exactly the
natural next steps from the current state.

| State         | Owner sees                 | Natural actions offered    |
| ------------- | -------------------------- | -------------------------- |
| not requested | "not yet requested"        | Send invite                |
| **Invited**   | "in progress"              | Mark pending, Grant, Block |
| **Pending**   | "in progress"              | Grant, Block               |
| **Granted**   | "done"                     | Revoke                     |
| **Revoked**   | "needs attention" (→ chat) | Send invite                |
| **Blocked**   | "needs attention" (→ chat) | Send invite, Grant         |

The owner only ever sees three buckets — **in progress**, **done**, or
**needs attention** — not the six operator states. Revoked and Blocked are
the only ones an owner cannot wait their way out of; they route the owner
to chat.

### Override vs. natural actions

The natural buttons (Send invite / Mark pending / Grant / Revoke / Block)
walk the normal progression and read as "the flow advanced." **Override**
is the separate, audited escape hatch: pick any target state directly for
an out-of-band grant or a correction. Keep them distinct — the audit log
uses that split to tell "the flow advanced" from "an operator forced a
state." Use the **Save note** field to record why (the note is visible on
the card and travels with the request).

_Demo:_ 카페 홍대입구점 is Blocked with a note explaining the owner cannot
find the invite; 헤어살롱 연남점 is Pending waiting on Google.

---

## Incident basics

- **A publish keeps failing.** Read `last_error` on the publish job. GBP:
  check the org credential exists and the location is VERIFIED. Instagram:
  check the channel link is `linked`. Remember the 3-attempt cap — after
  that the job is terminal and needs a fresh request or an override, not
  another retry.
- **An owner says they never heard about a ready campaign.** Check the
  Awaiting-owner card's nudge timestamp — if it is empty, no nudge was
  sent. Message them and record it.
- **The console shows stale or missing data.** Both apps read one Postgres
  in staging/production; neither migrates at runtime. If a schema-bearing
  deploy shipped, confirm `db:pg:migrate` was run (see
  [migration-runbook.md](../deployment/migration-runbook.md)).
- **Everything looks "fake" / nothing reaches real Google or Instagram.**
  Expected — staging runs `APP_INTEGRATION_MODE=stub`. See the
  [production cutover checklist](../deployment/v2-production-cutover.md)
  for what flipping to live entails (and why you should not flip it
  casually).
- **Suspected data issue on staging.** Never reset production. `db:pg:reset`
  is blocked in production-like environments by design; staging resets go
  through the guarded harness. Escalate before touching data.

## Reference

- Pipeline architecture and state machines: [architecture.md](./architecture.md)
- Delivery plan and scope decisions: [delivery-plan.md](./delivery-plan.md)
- Migrations: [../deployment/migration-runbook.md](../deployment/migration-runbook.md)
- Cutover + rollback: [../deployment/v2-production-cutover.md](../deployment/v2-production-cutover.md)
