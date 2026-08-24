# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Guardrails (owner-app specific)

These are invariants that a single-file read won't surface — they were
each violated in production at least once. Check them explicitly when
touching the related code, don't just pattern-match the nearest existing
route.

- **Live GBP actions gate on `VERIFIED`, nowhere else.** The single
  source of truth is `canUseLiveGbpActions()` in
  `packages/domain/src/gbp-eligibility.ts` — any new route that posts,
  replies to reviews, or otherwise calls a live Google API must go
  through it rather than re-deriving its own status check. Google can
  reject actions mid-claim or mid-verification, so a bypass isn't just
  a style nit.
- **Setup-record ids must be derived per store, never a fixed
  constant used as a primary key.** `gbp-setup-record-values.ts`
  historically hardcoded the account/location/audit/oauth/job ids;
  every store's setup upserted into the _same_ rows via
  `ON CONFLICT(id) DO UPDATE`, so the second store to onboard silently
  stole the first store's GBP records (fixed in #73). If you add a new
  setup-record type, derive its id from the store, not a literal.
- **Audit `actor_user_id` is a real FK into `users` — never hardcode
  it.** It was once hardcoded to the literal `"demo-owner"`, which only
  worked because the demo seed happens to use that id; any real owner
  session would have hit an FK violation. Always thread the session's
  actual user id through.
- **Google `requestId`s must not be truncated.** A base64url-truncated
  hash is barely more entropy than the store id itself — two profiles
  sharing that prefix can collide into the same `requestId` and corrupt
  each other's create call. Use the full digest (see the `store-profile.ts`
  fix in #73).
- **Publish attempts are idempotency-keyed; a key conflict is a
  signal, not an error to swallow.** `post-flow.ts` returns
  `IDEMPOTENCY_KEY_CONFLICT` deliberately — don't retry by minting a new
  key to route around it, and don't relax the conflict check to "fix" a
  flaky-looking test.
- **Conversation replay (`clientEventId`) must stay side-effect-free
  on a duplicate.** Onboarding conversation turns are resumed/replayed
  by client event id; a duplicate request must not re-run the
  Naver/OpenAI call or write a second turn.
- **Owner sessions must never resolve against the admin cookie/table.**
  `src/auth/session.ts` defines the owner cookie name and DB-backed
  session store independently of `apps/admin/src/auth/session.ts` — do
  not add a code path that accepts one for the other, even as a
  convenience for local testing.
