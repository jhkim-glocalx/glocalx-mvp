# Scripted demo walkthrough — GlocalX v2

> **한국어:** [demo-walkthrough.ko.md](./demo-walkthrough.ko.md)

A presenter's script for showing GlocalX v2 end to end to an investor or an
incoming operator cohort. It runs on the **Phase 5 demo seed** in stub mode
— nothing here touches real Google, Instagram, Naver, or OpenAI, so the demo
is fully deterministic and repeatable.

- **Runs on:** the demo cohort loaded by `db:reset && db:seed` (see the
  seed table in [ops-runbook.md](./ops-runbook.md#the-demo-dataset-dry-run-before-you-touch-real-stores)).
- **Length:** ~10 min investor cut (Acts 1–2), ~20 min operator-training cut
  (add the callouts and the reset at the end).
- **Two surfaces:** the mobile **owner app** (`apps/owner-app`, :3000) and
  the dark **operator console** (`apps/admin`, :3100).
- **The one sentence to land:** _"A shop owner who has never done digital
  marketing chats with us in plain Korean; an operator turns that into
  published Google and Instagram posts — the software runs the pipeline, a
  human makes every judgment call."_

---

## Before you present (setup, ~2 min, do offstage)

Pin Node 22 (`export PATH=/Users/jaehun/.nvm/versions/node/v22.18.0/bin:$PATH`).

```bash
npm run db:reset && npm run db:seed          # loads the 7-store demo cohort (SQLite)
ADMIN_SEED_EMAIL=ops@glocalx.example ADMIN_SEED_PASSWORD='demo-strong-pass' \
  ADMIN_SEED_NAME='Demo Operator' ADMIN_SEED_ROLE=OPERATOR \
  npm run seed:admin -w apps/admin           # one operator login
```

> The admin console reads its own workspace database (`apps/admin/.glocalx/dev.db`).
> If Stores/Queue/Inbox look empty, you seeded the owner-app db instead — reseed
> with `GLOCALX_DB_PATH=<abs path to apps/admin/.glocalx/dev.db> npm run db:seed`
> then `seed:admin` against the same path. (This is the exact gotcha from the
> Phase 5 QA pass.)

Start both servers (never via `Bash` — use the preview tooling / two terminals):

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000    # owner app
npm run dev -w apps/admin                           # operator console (:3100)
```

Confirm `APP_INTEGRATION_MODE=stub`. Open two browser windows side by side:
owner app on `http://127.0.0.1:3000`, console on `http://127.0.0.1:3100`.

**Logins for the demo**

| Surface  | How                                                                                          |
| -------- | -------------------------------------------------------------------------------------------- |
| Owner    | Root `/` → **구글로 시작** resolves (stub) to the demo owner → lands on the happy-path store |
| Owner    | To show onboarding live: `/register` a brand-new email → fresh `NOT_STARTED` store           |
| Operator | `/login` → `ops@glocalx.example` / the password you seeded above                             |

---

## Act 1 — The owner (mobile owner app, ~4 min)

The point of this act: **it's effortless for the owner.** They do not learn
GBP, they do not touch an ad platform — they answer a few prompts in Korean.

### Scene 1a — Onboarding from zero (the "wow, that's it?" moment)

1. Open the owner app at `/`. Narrate the entry: _"소셜 계정이나 이메일로 시작"_
   — three buttons, 카카오 / 구글 / 이메일. This is the whole sign-up.
2. **구글로 시작** (or register a fresh email to show a truly blank store).
3. You land in the workspace. The first tab is **가게 인증 및 등록** — say:
   _"우리는 사장님께 상호명만 받습니다. 나머지는 네이버에서 끌어옵니다."_
   In stub mode the Naver business extraction returns a deterministic result,
   so the store's name/address/category/hours fill in without the owner
   typing them.
4. Confirm the store. Point out the **GBP access card** in this same tab —
   the owner only ever sees three states: **in progress / done / needs
   attention** — never the six operator states behind it. _"사장님은 '진행 중'만
   보면 됩니다. 구글 권한의 복잡함은 운영자가 대신 처리합니다."_

> **Talk-track:** the owner's entire job in v2 is: say your store name,
> confirm what we found, and chat when you want something. Everything Google-
> or ad-platform-shaped is concierge work.

### Scene 1b — The steady state (log in as the happy-path store)

Switch to the demo owner (구글로 시작) so you land on **브런치모먼트 홍대점**
(`demo-store`) — the fully-completed store.

1. **가게 인증 및 등록:** GBP access shows **done**, location VERIFIED.
2. **마케팅 소재 요청:** show a campaign the owner requested — this is the
   brief that becomes operator work in Act 2.
3. **여러 SNS 자동홍보 / 홍보 콘텐츠 넣기:** show a **published** post (it went
   to both Google Business Profile and Instagram). _"사장님이 요청하면, 운영자가
   제작하고, 승인 후 여러 채널에 한 번에 게시됩니다."_
4. **주간 홍보 실적 / 홍보 실적 자세히 보기:** the performance view — the payoff
   the owner actually cares about. (Stub metrics, deterministic.)

Hand-off line into Act 2: _"사장님 쪽은 이게 전부입니다. 이제 이 요청들이 운영자
콘솔에서 어떻게 처리되는지 보시죠."_

---

## Act 2 — The operator (dark console, ~5 min)

The point of this act: **one operator runs many stores through a visible
pipeline, and every advance is a deliberate human action** — that's the
concierge learning loop, not a limitation.

Log in at `:3100/login`. You land on **Stores**.

### Scene 2a — Stores: GBP access across every state

The Stores console works the org's manager-access requests on each store's
Google Business Profile. Walk the seeded cohort — one store parked in each
state:

| Store           | State       | Say                                                   |
| --------------- | ----------- | ----------------------------------------------------- |
| 동네빵집 망원점 | **Invited** | invite sent, waiting on the owner to accept           |
| 헤어살롱 연남점 | **Pending** | owner accepted, waiting on Google                     |
| 필라테스 합정점 | **Granted** | access we can publish from                            |
| 카페 홍대입구점 | **Blocked** | owner can't find the invite → routed to chat (see 2c) |

Show the two kinds of controls and why they're separate:

- **Natural actions** (Send invite / Mark pending / Grant / Revoke / Block)
  walk the normal progression — _"the flow advanced."_
- **Override** is the audited escape hatch — pick any target state directly
  for an out-of-band correction. _"감사 로그가 '흐름이 진행됨'과 '운영자가 강제로
  바꿈'을 구분합니다."_ Use **Save note** to record why.

### Scene 2b — Queue: the campaign pipeline as a kanban

Open **Queue**. Each card is one campaign request; columns are its status.
The seed puts a card in every column:

| Column                | Demo store          | The move                                             |
| --------------------- | ------------------- | ---------------------------------------------------- |
| **Submitted**         | 동네빵집 망원점     | pick it up → move to production                      |
| **In production**     | 헤어살롱 연남점     | produce assets, write final copy                     |
| **Awaiting owner**    | 필라테스 합정점     | already **nudged** — show the "Owner notified" stamp |
| **Changes requested** | 카페 홍대입구점     | read the note, revise                                |
| **Publishing**        | 분식상회 상수점     | **partially published** — GBP ok, Instagram failed   |
| **Settled**           | 브런치모먼트 홍대점 | published on both channels — terminal                |

Two things to call out here — they're the product's spine:

1. **The owner nudge.** v2 has **no push channel**. A card in _Awaiting
   owner_ doesn't move until the operator messages the owner on KakaoTalk/
   phone and records it. A card with **no** nudge stamp is top priority.
   _"자동 알림이 없습니다 — 이게 의도된 컨시어지 접점입니다."_
2. **The retry cap.** 분식상회 상수점 is _partially published_: GBP succeeded,
   Instagram failed because its link is expired. Publishing is per-channel,
   **operator-retried, never automatic**, and locks terminal after **3
   attempts** (`publishJobMaxAttempts`). Show the failed job's `last_error`.

### Scene 2c — Inbox: one owner-facing assistant, a human seam behind it

Open **Inbox**. The owner always sees a single "assistant"; the operator
decides who actually writes each reply. Show all three postures:

| Store           | Mode          | Say                                                                      |
| --------------- | ------------- | ------------------------------------------------------------------------ |
| 김밥천국 신촌점 | **Human**     | operator writes every reply — the concierge default                      |
| 헤어살롱 연남점 | **AI draft**  | an AI drafted a reply, **unsent** — operator reviews then **Send draft** |
| 카페 홍대입구점 | **flagged ⚑** | needs a human now (owner blocked on their GBP invite) → **Assign to me** |

The AI-draft seam is the story: _"AI가 초안을 쓰지만, 운영자가 보내기 전까지 사장님은
절대 보지 못합니다. 사람이 판단을 유지하면서 속도만 AI로 얻습니다."_ Then tie 카페
홍대입구점's flag back to its **Blocked** GBP state in Stores — the same owner,
one coherent problem across two consoles.

---

## Closing (~1 min)

Return to the owner window on the performance view.

> _"사장님은 상호명 하나로 시작해서 게시된 포스트와 실적을 봅니다. 운영자 한 명이
> 여러 매장의 파이프라인을 눈으로 보며 굴립니다. 오늘 데모는 전부 결정적 스텁 위에서
> 돌았습니다 — 실제 채널 연동은 크레덴셜을 꽂고 채널별로 검증하면 그대로 라이브가
> 됩니다."_

If asked "is this live?": be honest — **staging runs `APP_INTEGRATION_MODE=stub`
by design.** The production adapters exist and fail closed
(`blocked_by_credentials`); flipping to live is a per-channel credential +
preview-validation step, documented in
[v2-production-cutover.md](../deployment/v2-production-cutover.md#the-stub--production-integration-flip-read-before-flipping).

---

## Anticipated questions

- **"What happens when a publish fails?"** → Queue 2b: per-channel, operator
  retry, 3-attempt cap, `partially_published` if one channel lands. Point at
  분식상회 상수점.
- **"How does the owner get notified?"** → No push by design; the operator
  nudges on the owner's existing channel and the queue tracks it (2b).
- **"Is the AI talking to my customers?"** → Not unless the operator opts a
  conversation into AI-draft/auto; default is Human, and AI drafts are never
  sent unseen (2c).
- **"How much can one operator handle?"** → That's what this cohort measures;
  the SLAs in [ops-runbook.md](./ops-runbook.md#suggested-slas-cohort-scale)
  are the starting hypothesis.
- **"Show me a store that isn't perfect."** → That's the whole cohort:
  Blocked access, changes requested, a failed channel, an unsent AI draft.

## Reset between runs

```bash
npm run db:reset && npm run db:seed
```

Idempotent and safe while the dev server holds the database. For a schema
that predates the `ensure*` helpers, stop the server and `rm -rf .glocalx`
first (see CLAUDE.md § Known risks).

## Reference

- Seed contents & operator actions: [ops-runbook.md](./ops-runbook.md)
- What "going live" entails: [../deployment/v2-production-cutover.md](../deployment/v2-production-cutover.md)
- Pipeline state machines: [architecture.md](./architecture.md)
