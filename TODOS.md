# TODOS

Deferred work with full context, so a future session can pick any item up
cold. Added by /plan-eng-review on 2026-07-17 (v2 plan review).

## 1. activity_events retention policy

- **What:** Scheduled cleanup deleting `activity_events` rows older than
  ~90 days (Vercel cron or equivalent).
- **Why:** The telemetry table records every owner screen transition and
  action, forever. Unbounded growth on billed Neon storage; also keeps
  the store-timeline queries lean.
- **Pros:** Bounded storage; predictable query cost.
- **Cons:** Introduces a cron trigger v2 deliberately doesn't have yet
  (shared with item 4).
- **Context:** Table defined in docs/v2/architecture.md §2. Irrelevant at
  the 10-20 store cohort; real within months of growth.
- **Depends on:** Phase 1 landed.

## 2. GBP Account Management API spike

- **What:** 1-2 day investigation: invitation/admin endpoints, quotas,
  org-account constraints, Google's new-manager restrictions.
- **Why:** Decides whether GBP manager-grant tracking can ever be
  automated (and whether Phase 4 onboarding can go fully self-serve).
  v2 ships operator-tracked state only (review decision D25).
- **Pros:** Converts the biggest external unknown into facts before any
  automation promise is made to customers or investors.
- **Cons:** The spike may conclude the API simply doesn't support it.
- **Context:** docs/v2/architecture.md §9 open question. The design doc
  (docs/v2/design-decisions.md) premise 1 made operator-assisted grants
  the primary path, so nothing in v2 blocks on this.
- **Depends on:** Org Google account + GBP OAuth client existing (week-1
  ops task in the delivery plan).

## 3. KakaoTalk notify (v2.1 fast-follow)

- **What:** Kakao notifications for assistant replies and
  ready-for-review material; automates the operator-nudge step.
- **Why:** Hedges premise 2 (in-app chat vs KakaoTalk) — if the kill
  metrics show Kakao winning at the week-4 evaluation, this is the
  pre-staged response. Also removes the manual nudge from the operator
  loop.
- **Pros:** Meets Korean owners on the channel they already answer.
- **Cons:** Kakao business channel setup, message templates, and
  platform review — real lead time.
- **Context:** Deferred from v2 scope twice deliberately (review
  decisions D7, D28). Kill-metric definitions live in
  docs/v2/design-decisions.md premise 2.
- **Depends on:** Week-4 kill-metric evaluation after cohort onboarding.

## 4. Orphaned upload cleanup

- **What:** Periodic sweep deleting Blob objects + `campaign_assets`
  rows from uploads whose campaign request was never submitted.
- **Why:** Client-direct uploads register assets before the request is
  submitted; owners navigating away mid-flow strand objects. The one
  silent unhandled path in the v2 design — harmless to users, leaks
  storage cost forever.
- **Pros:** Bounded Blob spend; closes the failure-mode audit's last gap.
- **Cons:** Needs the same cron trigger as item 1 — build them as one
  job.
- **Context:** Upload flow specified in docs/v2/architecture.md §6
  (client-direct tokens, review decision D16).
- **Depends on:** Phase 3 landed; pairs with item 1.
