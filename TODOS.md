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

## 5. GBP 리스팅 삭제 프로브 (Google API)

- **What:** 조직 계정이 만든 GBP 리스팅을 Google API로 삭제할 수 있는지
  실측한다(미인증 상태 / 인증된 상태 각각). 가능하면
  `GbpBusinessInformationAdapter`에 삭제 메서드를 추가하고 어드민에
  "Google에서 삭제" 버튼을 붙인다.
- **Why:** 어드민 detach(연결 해제)는 우리 DB만 되돌린다. 잘못 만들어진
  리스팅은 Google에 공개된 채 남아 실제 사업체 정보를 오염시킨다. 사장님이
  "지워주세요"라고 연락했을 때 운영자가 앱 안에서 끝낼 수 없다.
- **Pros:** 연결 해제가 진짜 원복이 된다. 운영자가 한 화면에서 마무리한다.
- **Cons:** Google이 거부하면 프로브 시간만 쓰고 끝난다. 인증된 리스팅은
  선(先) 인증 해제가 필요할 수 있다.
- **Context:** 현재 어댑터는 list/search/requestAdminRights/validate/create만
  갖는다 — 삭제 메서드가 아예 없다. 안전 테스트 리스팅(조직 계정의
  "글로컬엑스/부산 서면로 39")이 이미 지정돼 있고, 이슈 #45의 인증 프로브와
  같은 방식으로 돌리면 된다. `/plan-eng-review` 2026-08-25 이슈 4에서
  명시적으로 미룬 항목.
- **Depends on:** 프로덕션 org 토큰 보유자(창업자)가 직접 실행. detach가
  먼저 있으면 프로브 결과를 바로 붙일 수 있다.

## 6. 접근 상태 모델의 "방향 반대" 케이스

- **What:** `gbp_access_requests`가 "사장님은 자기 리스팅에 권한이 없고 우리
  조직만 관리한다"는 상황을 표현하게 만든다. 사장님을 자기 리스팅의
  소유자/관리자로 초대하는 경로를 포함한다.
- **Why:** org 계정이 생성한 리스팅을 `granted`로 두기로 했지만(리뷰 이슈 19),
  `granted`의 원래 의미는 "우리가 사장님 리스팅에 매니저 권한을 받았다"이다.
  org 생성은 방향이 반대다. 지금은 발행이 동작하니 증상이 없지만, 사장님이
  해지하거나 직접 관리하고 싶을 때 넘겨줄 경로가 없다.
- **Pros:** 이탈/소유권 이전 요구에 답할 수 있다. `granted`가 한 가지 의미만
  갖게 되어 상태 해석이 명확해진다.
- **Cons:** 상태 기계와 마이그레이션, 사장님 UI가 함께 바뀐다. 지금 요구하는
  고객은 없다.
- **Context:** 상태는 not_requested / adoption_review / granted / revoked /
  blocked이고 `confirmAdoptionSourceStates = [adoption_review, blocked]`.
  입양 경로도 같은 가정(사장님 리스팅에 우리가 들어간다)을 깔고 있어 두 경로
  모두 해당된다. `/plan-eng-review` 2026-08-25 이슈 19에서 의도적으로 감수한
  부정확성.
- **Depends on:** 없음. 고객이 이탈이나 소유권 이전을 요구하기 시작할 때 재개.
