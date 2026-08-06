# Design: Instagram Connect — owner-facing channel linking for non-technical SMBs

> **한국어:** [instagram-connect-onboarding.ko.md](instagram-connect-onboarding.ko.md)

Drafted 2026-08-06
Branch: main
Status: DRAFT — for founder review
Related: [design-decisions.md](design-decisions.md) (v2 concierge split), [architecture.md](architecture.md)

## Problem Statement

The v2 concierge model publishes to Google Business Profile from an **org
account** — one Google identity with org access to many owners' locations, so
the owner never connects anything for GBP. Instagram has **no equivalent**.
Meta's Content Publishing API is per-account: to post to a store's Instagram,
the app must hold an access token that _that specific Instagram business
account_ granted it. There is no "one org token manages every store's
Instagram."

So Instagram forces something GBP did not: **each store owner must grant our
app permission to their own Instagram account.** Our target user is a Korean
small-business owner who is not Instagram-savvy and will not touch a developer
console. The design question is: what is the least-friction, most-trustworthy
way for that owner to hand us publishing permission — once — and never think
about it again?

The current developer-console "Generate token" path (used to validate the
channel, see `apps/owner-app/scripts/validate-instagram-account.mjs`) is a
**developer tool** and must never be exposed to owners.

## What already exists (so we build the gap, not the whole thing)

- **Per-store token storage.** [`store_channel_links`](../../packages/db/src/migrations/0011_store_channel_links.sql)
  already has `(store_id, channel IN ('gbp','instagram'), external_account_ref,
encrypted_token, status IN ('linked','expired','revoked'))`.
- **Read path.** [`PublishTargetStore`](../../packages/db/src/support/publish-target-store.ts)
  already exposes `readStoreChannelLink` (view-safe, no token) and
  `readStoreChannelToken` (encrypted → `found` / `absent` / `undecryptable`).
- **Publish path.** The adapter
  ([`instagram.ts`](../../packages/integrations/src/instagram.ts)) already
  accepts a per-store `input.account = { accessToken, accountRef }`
  ([`instagram-contracts.ts`](../../packages/integrations/src/instagram-contracts.ts)),
  falling back to the global env account when omitted.
- **OAuth precedent.** Owner login already does the full start/callback dance
  with a one-time state cookie
  ([`api/auth/google/start`](../../apps/owner-app/src/app/api/auth/google/start/route.ts)
  - [`callback`](../../apps/owner-app/src/app/api/auth/google/callback/route.ts)),
    and token encryption exists (`@glocalx/domain/token-encryption`).

**The gap:** (1) an owner-facing "connect Instagram" OAuth flow that _writes_ a
`store_channel_links` row (rather than creating an auth session), (2) an
Instagram token-exchange/refresh module, (3) the onboarding card + the
personal-vs-professional-account guidance UX.

## Goals / Non-goals

**Goals**

- An owner connects their store's Instagram in ≤ the effort of the Kakao login
  they already did: tap → Instagram's own consent screen → done.
- The owner never sees, copies, or handles a token.
- Guide the very common "my Instagram is a personal account" case to
  conversion, in-app, without dead-ending.
- Store a **long-lived** token per store and refresh it silently before expiry.
- Degrade gracefully: an unconnected store still gets value (draft assist).

**Non-goals**

- No change to the owner-approval gate — connecting a channel is not consent to
  auto-post. Every publish still goes through the existing approval path.
- Not building multi-account-per-store, Stories/Reels, or comment management.
- Not solving App Review here (business/ops track, noted below).

## User-facing flow

The owner is in onboarding (or later, in the app's channel settings) and sees a
**"인스타그램 연결하기"** card next to the GBP card.

1. **Tap "연결하기".** We redirect to Instagram's hosted authorize screen
   (`https://www.instagram.com/oauth/authorize`) with scopes
   `instagram_business_basic,instagram_business_content_publish`.
2. **Instagram's own screen** (trusted, not our UI): the owner logs in if
   needed and taps **허용**.
3. **Back in our app.** We exchange the code server-side, store the token, and
   show the card as **연결됨 · @그들의핸들**. Done — 2–3 taps.

**The real friction is account type, not OAuth.** The Content Publishing API
requires a **Business or Creator** account; many owners have a **personal**
one. Two places to handle it:

- If we can detect it up front (e.g. the owner tells the chat assistant, or a
  prior signal), show a pre-step: _"인스타그램을 프로페셔널 계정으로 바꿔야
  자동 게시가 가능해요"_ with a 3-image how-to (Instagram 설정 → 계정 유형 →
  프로페셔널 전환, free, ~1 min).
- If discovered only at consent failure, the callback maps Meta's error to a
  friendly **`needs_professional_account`** card state with the same how-to and
  a "다시 시도" button — never a raw error.

**Fallback for owners who can't/won't connect.** The pipeline still produces the
finished post; instead of auto-publishing we hand it off (notify owner → they
post manually), preserving the core value and leaving an upsell hook ("자동으로
올려드릴까요? 연결하기"). This keeps Instagram-less and personal-account owners
in the product.

## Technical design

### OAuth: link, don't authenticate

Two new routes, structurally mirroring the Google **login** OAuth but with a
crucial difference — the callback attaches a channel to the _already
authenticated_ owner's store instead of minting a session:

- `POST /api/instagram/oauth/start` (or GET link) — requires a valid owner
  session + resolved store; sets a one-time state cookie bound to `storeId`;
  302 to Instagram authorize.
- `GET /api/instagram/oauth/callback` — validate state (reject on mismatch,
  expire the cookie, same as Google callback); exchange `code`; resolve owner
  session + store ownership via `withQueryableRouteDatabase`; **upsert the
  `store_channel_links` row**; 303 back to `/onboarding` (or settings) with a
  success/needs-professional flag. Never creates an auth session.

Ownership enforcement is the same rule as every other route: the callback must
confirm the session's `storeId` matches the state cookie's `storeId` before
writing. A mismatched or missing session aborts without writing a link.

### Token exchange + refresh (new module, stub + production)

New `instagram-oauth` adapter module (mirrors `google-org-auth.ts`'s
shape; stub returns deterministic values, production hits Meta):

| Step               | Endpoint                                                                   | Notes                                                            |
| ------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| authorize URL      | `www.instagram.com/oauth/authorize`                                        | client_id = **Instagram** app id (923493387435637), scopes above |
| code → short-lived | `POST api.instagram.com/oauth/access_token`                                | returns `{ access_token, user_id, permissions }`                 |
| short → long-lived | `GET graph.instagram.com/access_token?grant_type=ig_exchange_token`        | ~60-day token, `expires_in`                                      |
| identity           | `GET graph.instagram.com/me?fields=user_id,username,account_type`          | `accountRef = user_id`; also gates account_type ≠ personal       |
| refresh            | `GET graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token` | valid >24h old, <60d; extends 60 days                            |

New env: `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_OAUTH_REDIRECT_URI`
(plus the existing token-encryption key). Production adapters keep the
credential-fallback discipline — missing creds return the controlled
`blocked_by_credentials` result, never a secret in logs.

### Storage & publish (mostly wiring existing pieces)

- On successful callback: `INSERT … ON CONFLICT(store_id, channel) DO UPDATE`
  into `store_channel_links` with `channel='instagram'`,
  `external_account_ref = user_id`, `encrypted_token = encrypt(longLived)`,
  `status='linked'`. The unique `(store_id, channel)` index means reconnecting
  replaces cleanly.
- Publish path: resolve `input.account` from `readStoreChannelToken` +
  `readStoreChannelLink` (both exist). `undecryptable` fails the job loudly;
  `absent`/`expired`/`revoked` blocks publish with an owner-facing "reconnect"
  prompt rather than silently falling back to the global env account for a
  real store.

### Token lifecycle

- **Refresh job.** A scheduled task refreshes `linked` tokens before the 60-day
  expiry; on refresh failure flip `status='expired'`. (Reuses whatever job
  runner the campaign pipeline already uses — to confirm during build.)
- **Revocation.** If Meta returns an auth error at publish time, flip to
  `revoked` and surface a reconnect card. Owner reconnect = re-run the flow.

### Stub mode

`APP_INTEGRATION_MODE=stub` keeps the whole flow demoable: the stub oauth module
returns a deterministic fake code/token and a stub handle, so onboarding shows
the connected state end-to-end with no Meta call — consistent with the v2
constraint that both apps stay fully demoable without live credentials.

## Meta gating (business/ops track — parallel, not code)

- **Development mode today:** only **Instagram Tester** accounts (added in the
  app's Roles tab, ≤25, must accept) can authorize. Enough for a hand-picked
  pilot cohort; **not** for arbitrary owners.
- **For general availability:** the app needs **App Review / Advanced Access**
  for `instagram_business_content_publish` (+ `instagram_business_basic`) and
  must be flipped to **Live mode**. This is the gate that turns "pilot" into
  "any owner can connect."
- Each store's Instagram must be **Business/Creator** (the professional-account
  UX above).

## Build slices (incremental, each shippable + dormant under stub)

1. **OAuth module + env + stub/prod adapters** — `instagram-oauth` (start URL,
   code→short→long, refresh, identity), contracts + tests, no UI. Dormant.
2. **Link routes** — `start` + `callback` writing `store_channel_links`;
   ownership + state-cookie enforcement; error→state mapping. Cross covered by
   request-spec tests.
3. **Onboarding card + states** — connect / connected / needs-professional /
   expired-reconnect, in `onboarding-gbp-panels.tsx` + `onboarding-model.ts`
   patterns; wire publish resolution to the stored link.
4. **Refresh job + revocation handling.**
5. **(Ops, parallel) App Review submission + Live mode.**

## Open questions

- **Detect personal-vs-professional earlier?** Is there a pre-consent signal
  (chat, Naver data) so we can guide conversion before the owner hits a consent
  failure? Improves first-try success materially.
- **Refresh scheduling home:** confirm the existing job runner can host the
  60-day refresh, or whether it needs a lightweight cron.
- **Settings surface:** connect only in onboarding, or also a post-onboarding
  "채널 관리" screen for reconnect after expiry? (Leaning both.)
- **Global env account:** keep the env fallback for our own demo/pilot IG, but
  should a _real_ store ever fall back to it? (Design says no — block instead.)

## Success criteria

- A pilot owner connects their store Instagram in ≤3 taps from the onboarding
  card, with no token ever visible to them.
- A personal-account owner is guided to conversion and completes the connect on
  retry, without seeing a raw Meta error.
- A connected store's approved post publishes to its own Instagram via the
  stored per-store token; an expired token prompts reconnect instead of failing
  silently or posting to the wrong account.
- Whole flow demoable under `APP_INTEGRATION_MODE=stub`.
