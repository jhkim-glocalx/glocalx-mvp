# 운영자 런북 — GlocalX v2

> **English:** [ops-runbook.md](ops-runbook.md)

운영자 콘솔(`apps/admin`, 어두운 "GlocalX Ops" 대시보드)을 운영하는 사람을 위한
일일 플레이북입니다. 운영자가 사는 세 콘솔 — **Queue**, **Inbox**, **Stores** —
과 게시 체크리스트, 인시던트 기본을 다룹니다.

v2는 **컨시어지** 제품입니다: 거의 모든 상태는 잡이 아니라 운영자가 옮겨서
전진합니다. 자동 구글 폴링도, 푸시 채널도, (오늘 기준) 라이브 통합도 없습니다 —
시스템 전체가 결정적 스텁(`APP_INTEGRATION_MODE=stub`) 위에서 돌기 때문에,
스테이징에서는 모든 "게시"와 "승인"이 시뮬레이션됩니다. 이는 설계에 의한 것이며,
수동 단계가 학습 메커니즘입니다.

## 콘솔 접근

초대 전용. 등록 라우트가 없으므로 각 운영자를 셸에서 시드합니다:

```bash
ADMIN_SEED_EMAIL=ops@glocalx.example ADMIN_SEED_PASSWORD='a-strong-password' \
ADMIN_SEED_NAME='Operator Name' ADMIN_SEED_ROLE=OPERATOR \
npm run seed:admin -w apps/admin
```

어드민 세션은 오너 세션과 분리되어 있고 앱 간에 절대 해석되지 않습니다.
오너(`apps/owner-app`)와 어드민(`apps/admin`)은 하나의 DB를 공유합니다.

## 데모 데이터셋 (실제 매장을 건드리기 전 드라이런)

`npm run db:reset && npm run db:seed`(로컬은 SQLite, 스테이징은 `db:pg:seed`)는
Phase 5 코호트를 로드합니다 — 각 콘솔이 렌더링하는 모든 상태에 매장을 하나씩
배치해, 알려진 매장에 대해 모든 액션을 리허설할 수 있습니다:

| 매장                               | Queue                              | Stores (GBP access) | Inbox             |
| ---------------------------------- | ---------------------------------- | ------------------- | ----------------- |
| 브런치모먼트 홍대점 (`demo-store`) | Settled (published, both channels) | — (e2e-owned)       | —                 |
| 김밥천국 신촌점                    | — (onboarding IN_PROGRESS)         | not requested       | open (human)      |
| 동네빵집 망원점                    | Submitted                          | Invited             | —                 |
| 헤어살롱 연남점                    | In production                      | Pending             | AI draft (unsent) |
| 필라테스 합정점                    | Awaiting owner (nudged)            | Granted             | —                 |
| 분식상회 상수점                    | Publishing (partially published)   | Granted             | —                 |
| 카페 홍대입구점                    | Changes requested                  | Blocked             | flagged handoff   |

---

## Queue — 캠페인 파이프라인

매장의 마케팅 요청이 칸반을 왼쪽에서 오른쪽으로 이동합니다. 각 카드는 하나의
`campaign_request`이고, 컬럼은 그 상태입니다.

| 컬럼                  | 상태                                 | 의미                                   | 할 일                                        |
| --------------------- | ------------------------------------ | -------------------------------------- | -------------------------------------------- |
| **Submitted**         | `submitted`                          | 오너가 브리프(+ 원본)를 보냄.          | 집어들기: 제작으로 옮기고 크리에이티브 시작. |
| **In production**     | `in_production`                      | 소재를 제작 중.                        | 가공 애셋 업로드, 최종 카피 작성.            |
| **Awaiting owner**    | `ready_for_review`                   | 소재 준비 완료; 오너의 go/no-go 필요.  | **오너 넛지**(아래 참고) 후 대기.            |
| **Changes requested** | `changes_requested`                  | 오너가 수정을 요청함.                  | 노트 읽고 수정 후 제작으로 되돌림.           |
| **Publishing**        | `publishing` / `partially_published` | 게시가 진행 중이거나 한 채널이 실패함. | 실패한 채널 재시도, 또는 조사.               |
| **Settled**           | `published` / `rejected` / `failed`  | 종료 상태.                             | 없음 — 완료됨.                               |

### 오너 넛지 (왜 "Awaiting owner"에 당신이 필요한가)

v2에는 **푸시 채널이 없습니다.** `ready_for_review`에 앉아 있는 요청은 당신이
오너가 이미 쓰는 채널(카카오톡, 전화)로 직접 연락해 소재가 준비됐다고 알리기
전까지 움직이지 않습니다. 큐가 이를 추적합니다: 넛지를 기록하면 카드에 **"Owner
notified …"**가 뜨고, 타임스탬프는 모든 상태 변경 시 초기화됩니다(넛지는 오너가
_지금_ 있는 상태에 속합니다). 넛지 타임스탬프가 **없는** Awaiting owner 카드가
당신의 최우선입니다 — 오너는 아직 자신이 결정을 빚졌다는 걸 모릅니다.

_데모:_ 필라테스 합정점이 이미 넛지된 Awaiting owner에 있습니다.

### 게시와 재시도 캡

게시는 채널별(GBP, Instagram)입니다. GBP는 오너의 토큰이 아니라 **조직** 구글
크레덴셜로 게시하므로, 조직 크레덴셜이 존재해야 하며 그렇지 않으면 채널이
차단됩니다(패널이 조용히 회색 처리하는 대신 이유를 말합니다). 실패한 채널은
**운영자가 재시도하며 절대 자동이 아니고**, **3회 시도**
(`publishJobMaxAttempts`) 후 종료 상태로 잠깁니다. 한 채널은 게시되고 다른
채널이 실패한 요청은 **부분 게시(partially published)** — 해당 카드에서 실패한
채널을 재시도하세요.

_데모:_ 분식상회 상수점은 GBP에 게시됐지만 Instagram 링크가 `expired`라서
Instagram이 실패(3회 시도)했습니다 → 부분 게시.

### 게시 체크리스트

1. 상태가 `approved`(오너가 go)이거나 실패한 채널을 재시도하는 중.
2. GBP의 경우: 매장의 GBP 접근이 **Granted**이고 위치가 **VERIFIED**(Stores
   콘솔)이며, 조직 구글 크레덴셜이 존재.
3. Instagram의 경우: 매장의 채널 링크가 `linked`(`expired` / `revoked` 아님).
4. 최종 카피가 작성·검토됨.
5. 채널을 게시하고, 카드에 외부 ref가 뜨고 published로 이동하는지 확인. 실패하면
   `last_error`를 읽고 원인을 고친 뒤 재시도(3회 캡 유의).

---

## Inbox — 고객 지원 채팅

매장당 한 번에 하나의 열린 대화. 오너는 항상 하나의 "assistant" 페르소나를
보고, 각 답장을 실제로 누가 쓸지는 당신이 정합니다.

### 모드 (대화별)

- **Human** — 당신이 모든 답장을 씁니다. 컨시어지 기본값.
- **AI draft** — AI가 답장을 작성하지만 **당신이 Send draft를 누르기 전까지 절대
  오너에게 발송되지 않습니다.** 검토·편집·폐기하세요. 이것이 원-어시스턴트
  이음매입니다: 오너는 미발송 초안을 절대 보지 못합니다.
- **AI auto** — AI가 직접 응답합니다(신중히, 잘 이해된 흐름에만 사용).

### 핸드오프와 플래그

**⚑**로 플래그된 대화는 사람이 필요합니다 — AI 작성이 실패했거나, 오너가 자동화로
해결할 수 없는 방식으로 막혀 있습니다. 플래그된 스레드가 당신의 첫 정거장입니다.
**Assign to me**로 맡고, 오너의 문제를 해결한 뒤, **Resolve**로 매장의 대화 슬롯을
비웁니다.

_데모:_ 헤어살롱 연남점은 미발송 초안이 대기 중인 AI draft이고, 카페 홍대입구점은
플래그됨(오너가 GBP 초대에서 막힘).

### 권장 SLA (코호트 규모)

- **플래그 / 핸드오프:** **1영업시간** 이내 응답.
- **새 오너 메시지(휴먼 모드):** 첫 답장 **4영업시간** 이내.
- **검토 대기 중인 AI 초안:** 최소 하루 **두 번** 초안 큐를 비우기; 초안이 하루가
  끝나도록 방치하지 말 것.
- 오너의 이슈가 닫히면 대화를 **Resolve**해 다음 대화가 열릴 수 있게 합니다.

---

## Stores — GBP 조직 접근

Stores 콘솔은 `gbp_access_requests` 테이블을 다룹니다: 게시하기 전에 각 매장의
구글 비즈니스 프로필에 조직이 필요로 하는 관리자 접근. **모든 홉은 운영자가
주도합니다** — 구글 폴링이 없으므로 상태는 당신이 아는 것을 반영하고, 제시되는
버튼은 현재 상태에서 정확히 자연스러운 다음 단계입니다.

| 상태          | 오너가 보는 것       | 제시되는 자연스러운 액션   |
| ------------- | -------------------- | -------------------------- |
| not requested | "아직 요청되지 않음" | Send invite                |
| **Invited**   | "진행 중"            | Mark pending, Grant, Block |
| **Pending**   | "진행 중"            | Grant, Block               |
| **Granted**   | "완료"               | Revoke                     |
| **Revoked**   | "확인 필요" (→ 채팅) | Send invite                |
| **Blocked**   | "확인 필요" (→ 채팅) | Send invite, Grant         |

오너는 오직 세 버킷만 봅니다 — **진행 중**, **완료**, **확인 필요** — 여섯 개의
운영자 상태가 아닙니다. Revoked와 Blocked만이 오너가 기다려서 빠져나올 수 없는
상태이며, 오너를 채팅으로 라우팅합니다.

### Override vs 자연스러운 액션

자연스러운 버튼(Send invite / Mark pending / Grant / Revoke / Block)은 정상 진행을
따라가며 "흐름이 진행됨"으로 읽힙니다. **Override**는 별도의, 감사되는 비상
탈출구입니다: 규정 외 승인이나 정정을 위해 어떤 목표 상태든 직접 지정합니다.
둘을 구분해 두세요 — 감사 로그가 그 구분을 사용해 "흐름이 진행됨"과 "운영자가
상태를 강제함"을 구별합니다. 이유는 **Save note** 필드로 기록하세요(노트는 카드에
보이고 요청과 함께 이동합니다).

_데모:_ 카페 홍대입구점은 오너가 초대를 못 찾는다는 노트와 함께 Blocked이고,
헤어살롱 연남점은 구글 처리를 기다리는 Pending입니다.

---

## 인시던트 기본

- **게시가 계속 실패한다.** 게시 잡의 `last_error`를 읽으세요. GBP: 조직
  크레덴셜이 존재하고 위치가 VERIFIED인지 확인. Instagram: 채널 링크가 `linked`인지
  확인. 3회 캡 유의 — 그 후 잡은 종료 상태이며, 또 다른 재시도가 아니라 새 요청이나
  override가 필요합니다.
- **오너가 준비된 캠페인에 대해 들은 적 없다고 한다.** Awaiting-owner 카드의 넛지
  타임스탬프를 확인하세요 — 비어 있으면 넛지가 안 보내진 것. 연락하고 기록하세요.
- **콘솔에 오래됐거나 없는 데이터가 보인다.** 두 앱은 스테이징/프로덕션에서 하나의
  Postgres를 읽고, 어느 쪽도 런타임에 마이그레이션하지 않습니다. 스키마를 담은
  배포가 나갔다면 `db:pg:migrate`가 실행됐는지 확인하세요(
  [migration-runbook.ko.md](../deployment/migration-runbook.ko.md) 참고).
- **모든 게 "가짜" 같고 / 무엇도 실제 구글이나 Instagram에 닿지 않는다.**
  예상된 것 — 스테이징은 `APP_INTEGRATION_MODE=stub`로 돕니다. 라이브 전환이
  수반하는 것(그리고 왜 함부로 전환하면 안 되는지)은
  [프로덕션 컷오버 체크리스트](../deployment/v2-production-cutover.ko.md)를
  보세요.
- **스테이징에서 데이터 이슈가 의심된다.** 프로덕션은 절대 리셋하지 마세요.
  `db:pg:reset`은 프로덕션 유사 환경에서 설계상 차단됩니다; 스테이징 리셋은 가드된
  하네스를 거칩니다. 데이터를 건드리기 전에 에스컬레이션하세요.

## 참고

- 파이프라인 아키텍처와 상태 머신: [architecture.ko.md](./architecture.ko.md)
- 딜리버리 계획과 범위 결정: [delivery-plan.ko.md](./delivery-plan.ko.md)
- 마이그레이션: [../deployment/migration-runbook.ko.md](../deployment/migration-runbook.ko.md)
- 컷오버 + 롤백: [../deployment/v2-production-cutover.ko.md](../deployment/v2-production-cutover.ko.md)
