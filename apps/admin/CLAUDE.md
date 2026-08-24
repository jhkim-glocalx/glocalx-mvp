# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Guardrails (admin specific)

These are invariants that a single-file read won't surface — they were
each violated in production at least once. Check them explicitly when
touching the related code, don't just pattern-match the nearest existing
route.

- **The GBP access state machine is operator-driven only — there is
  no automated Google polling in v2.** Its whole job is to reject an
  incoherent jump, not to advance anything on its own. When a transition
  needs to check "which states can this come from," import the exported
  list (e.g. `confirmAdoptionSourceStates` in
  `packages/domain/src/gbp-access.ts`) rather than hand-copying the
  states into the route — a hand-copied list drifts silently.
- **Adoption confirm/reject is refusal-safe: refusing must never
  advance state.** `CONFIRM_ADOPTION`/reject on an owner's "this
  listing is already mine" claim used to advance state even on a
  refusal (fixed in #71) — a refusal is a dead end, not a step forward.
  Use the request's own snapshot as the concurrency token so a stale
  refusal can't clobber a newer state.
- **Confirming adoption attaches an org-owned listing on the
  operator's word alone — no Google approval stands behind it.** That
  makes the audit log entry the _only_ record of who authorized the
  attachment. Every access-state-changing action (`gbp_access_*` in
  `AdminAuditAction`) must write an audit log entry; don't add a new
  transition that skips it.
- **`OVERRIDE` must fully detach what adoption attached, not just
  rewind the request state.** It used to only reset
  `gbp_access_requests.state`, leaving the `gbp_locations`/
  `gbp_accounts` rows behind — so a wrongly-adopted listing stayed
  permanently attached even after an operator "undid" it. Any code path
  that reverses an adoption must call the shared detach helper
  (`detachOrgLocationFromStore` in
  `packages/db/src/support/gbp-location-attach.ts`), not just flip a
  status column.
- **`audit_logs.actor_user_id` is a real FK into `users` —
  operators live in `admin_users`, a different table.** Don't try to
  satisfy the FK with an admin user's id. Carry operator identity in the
  redacted payload instead and leave `actor_user_id` NULL for
  admin-originated actions.
- **Admin sessions must never resolve against the owner cookie/table.**
  `src/auth/session.ts` mirrors the owner session design (opaque
  DB-backed id, 7-day expiry) but uses a different cookie name and a
  different table on purpose — do not add a code path that accepts one
  for the other, even as a convenience for local testing.
