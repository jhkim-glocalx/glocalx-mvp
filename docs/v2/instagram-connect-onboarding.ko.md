# 설계: 인스타그램 연결 — 비-전문 소상공인을 위한 오너용 채널 연동

> **English:** [instagram-connect-onboarding.md](instagram-connect-onboarding.md)

작성 2026-08-06
브랜치: main
상태: DRAFT — 창업자 검토용
관련 문서: [design-decisions.ko.md](design-decisions.ko.md) (v2 컨시어지 분할), [architecture.ko.md](architecture.ko.md)

## 문제 정의

v2 컨시어지 모델은 Google Business Profile을 **조직(org) 계정** 하나로 발행한다
— 여러 오너의 위치(location)에 org 접근 권한을 가진 단일 Google 신원이므로,
오너는 GBP를 위해 아무것도 연결하지 않는다. 인스타그램에는 **이에 해당하는
것이 없다.** Meta의 콘텐츠 발행(Content Publishing) API는 계정 단위다: 어떤
매장의 인스타그램에 글을 올리려면, 앱이 _바로 그 인스타그램 비즈니스 계정이
직접 부여한_ 액세스 토큰을 쥐고 있어야 한다. "org 토큰 하나로 모든 매장의
인스타를 관리"하는 건 불가능하다.

그래서 인스타그램은 GBP에는 없던 요구를 강제한다: **각 매장 오너가 자기 인스타
계정에 대해 우리 앱에 발행 권한을 부여해야 한다.** 우리 타깃 유저는 인스타를
잘 다루지 못하고 개발자 콘솔 따위는 절대 건드리지 않을 한국 소상공인이다.
설계 질문은 이것이다: 그 오너가 **단 한 번**, 가장 마찰이 적고 가장 신뢰가 가는
방식으로 우리에게 발행 권한을 넘기고 — 그 뒤로는 다시 신경 쓰지 않게 하려면
어떻게 해야 하는가?

지금의 개발자 콘솔 "Generate token" 경로(채널 검증용으로 사용,
`apps/owner-app/scripts/validate-instagram-account.mjs` 참고)는 **개발자 도구**
이며 오너에게 절대 노출되어선 안 된다.

## 이미 있는 것 (전체가 아니라 빈 부분만 만들면 됨)

- **매장별 토큰 저장소.** [`store_channel_links`](../../packages/db/src/migrations/0011_store_channel_links.sql)
  에 이미 `(store_id, channel IN ('gbp','instagram'), external_account_ref,
encrypted_token, status IN ('linked','expired','revoked'))` 가 있다.
- **읽기 경로.** [`PublishTargetStore`](../../packages/db/src/support/publish-target-store.ts)
  가 이미 `readStoreChannelLink`(뷰 안전, 토큰 없음)와
  `readStoreChannelToken`(암호화 → `found` / `absent` / `undecryptable`)를 노출.
- **발행 경로.** 어댑터([`instagram.ts`](../../packages/integrations/src/instagram.ts))
  가 이미 매장별 `input.account = { accessToken, accountRef }`
  ([`instagram-contracts.ts`](../../packages/integrations/src/instagram-contracts.ts))
  를 받고, 생략 시 전역 env 계정으로 폴백한다.
- **OAuth 선례.** 오너 로그인이 이미 일회용 state 쿠키로 start/callback 전 과정을
  수행한다([`api/auth/google/start`](../../apps/owner-app/src/app/api/auth/google/start/route.ts)
  - [`callback`](../../apps/owner-app/src/app/api/auth/google/callback/route.ts)),
    토큰 암호화도 존재한다(`@glocalx/domain/token-encryption`).

**빈 부분:** (1) 인증 세션을 만드는 게 아니라 `store_channel_links` 행을 *기록*하는
오너용 "인스타그램 연결" OAuth 플로우, (2) 인스타그램 토큰 교환·갱신 모듈,
(3) 온보딩 카드 + 개인 vs 프로페셔널 계정 안내 UX.

## 목표 / 비목표

**목표**

- 오너가 이미 해본 카카오 로그인 정도의 노력으로 매장 인스타를 연결: 탭 → 인스타
  자체 동의 화면 → 완료.
- 오너는 토큰을 보거나, 복사하거나, 다루지 않는다.
- 아주 흔한 "내 인스타는 개인 계정" 케이스를 막다른 길 없이 앱 안에서 전환으로
  유도.
- 매장별로 **장기(long-lived)** 토큰을 저장하고 만료 전 조용히 갱신.
- 우아한 저하: 연결하지 않은 매장도 여전히 가치를 얻는다(초안 어시스트).

**비목표**

- 오너 승인 게이트는 그대로 — 채널 연결이 자동 게시 동의를 뜻하지 않는다. 모든
  발행은 기존 승인 경로를 거친다.
- 매장당 다중 계정, 스토리/릴스, 댓글 관리는 만들지 않음.
- App Review는 여기서 풀지 않음(사업/운영 트랙, 아래 명시).

## 오너가 겪는 플로우

오너는 온보딩(또는 이후 앱의 채널 설정)에서 GBP 카드 옆에 **"인스타그램
연결하기"** 카드를 본다.

1. **"연결하기" 탭.** 인스타그램 호스팅 authorize 화면
   (`https://www.instagram.com/oauth/authorize`)으로, 스코프
   `instagram_business_basic,instagram_business_content_publish`와 함께 리다이렉트.
2. **인스타그램 자체 화면**(우리 UI 아님, 신뢰됨): 필요 시 로그인 후 **허용** 탭.
3. **앱으로 복귀.** 서버에서 코드를 교환하고 토큰을 저장한 뒤 카드를 **연결됨 ·
   @그들의핸들**로 표시. 끝 — 2~3탭.

**진짜 마찰은 OAuth가 아니라 계정 종류다.** 콘텐츠 발행 API는 **비즈니스/크리에이터**
계정을 요구하는데, 많은 오너는 **개인** 계정을 쓴다. 두 지점에서 처리한다:

- 미리 감지할 수 있으면(예: 오너가 챗 어시스턴트에 말함, 또는 사전 신호) 사전
  단계를 보여준다: _"인스타그램을 프로페셔널 계정으로 바꿔야 자동 게시가 가능해요"_
  - 3장짜리 방법 안내(인스타그램 설정 → 계정 유형 → 프로페셔널 전환, 무료, 약 1분).
- 동의 실패 시점에야 발견되면, 콜백이 Meta 에러를 친절한
  **`needs_professional_account`** 카드 상태로 매핑 — 같은 안내 + "다시 시도"
  버튼, 원시 에러는 절대 노출하지 않음.

**연결 못/안 하는 오너용 폴백.** 파이프라인은 여전히 완성된 게시물을 만든다.
자동 발행 대신 핸드오프(오너에게 알림 → 직접 게시)하여 핵심 가치를 보존하고
업셀 훅("자동으로 올려드릴까요? 연결하기")을 남긴다. 이렇게 인스타 없는/개인
계정 오너도 제품 안에 머문다.

## 기술 설계

### OAuth: 인증이 아니라 연결

Google **로그인** OAuth를 구조적으로 그대로 따르는 새 라우트 2개. 단 결정적 차이
— 콜백이 세션을 발급하는 대신, _이미 인증된_ 오너의 매장에 채널을 붙인다:

- `POST /api/instagram/oauth/start` (또는 GET 링크) — 유효한 오너 세션 + 해석된
  매장을 요구; `storeId`에 묶인 일회용 state 쿠키를 설정; 인스타그램 authorize로 302.
- `GET /api/instagram/oauth/callback` — state 검증(불일치 시 거부, 쿠키 만료,
  Google 콜백과 동일); `code` 교환; `withQueryableRouteDatabase`로 오너 세션 +
  매장 소유권 해석; **`store_channel_links` 행 upsert**; 성공/프로페셔널-필요
  플래그와 함께 `/onboarding`(또는 설정)으로 303. 인증 세션은 절대 만들지 않음.

소유권 강제는 다른 모든 라우트와 같은 규칙이다: 콜백은 기록 전에 세션의
`storeId`가 state 쿠키의 `storeId`와 일치하는지 확인해야 한다. 불일치/부재 세션은
링크를 기록하지 않고 중단한다.

### 토큰 교환 + 갱신 (새 모듈, stub + production)

새 `instagram-oauth` 어댑터 모듈(`google-org-auth.ts`의 형태를 따름; stub은
결정적 값을 반환, production은 Meta 호출):

| 단계          | 엔드포인트                                                                 | 비고                                                        |
| ------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| authorize URL | `www.instagram.com/oauth/authorize`                                        | client_id = **Instagram** 앱 id(923493387435637), 위 스코프 |
| code → 단기   | `POST api.instagram.com/oauth/access_token`                                | `{ access_token, user_id, permissions }` 반환               |
| 단기 → 장기   | `GET graph.instagram.com/access_token?grant_type=ig_exchange_token`        | 약 60일 토큰, `expires_in`                                  |
| 신원          | `GET graph.instagram.com/me?fields=user_id,username,account_type`          | `accountRef = user_id`; account_type ≠ personal 게이트      |
| 갱신          | `GET graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token` | 24시간 초과·60일 미만에서 유효; 60일 연장                   |

새 env: `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_OAUTH_REDIRECT_URI`
(기존 토큰-암호화 키에 더해). production 어댑터는 자격증명 폴백 규율을 유지 —
자격증명 누락 시 로그에 비밀을 남기지 않고 통제된 `blocked_by_credentials`
결과를 반환.

### 저장 & 발행 (대부분 기존 조각의 배선)

- 콜백 성공 시: `store_channel_links`에 `channel='instagram'`,
  `external_account_ref = user_id`, `encrypted_token = encrypt(장기토큰)`,
  `status='linked'`로 `INSERT … ON CONFLICT(store_id, channel) DO UPDATE`. 유니크
  `(store_id, channel)` 인덱스 덕분에 재연결이 깔끔히 교체된다.
- 발행 경로: `readStoreChannelToken` + `readStoreChannelLink`(둘 다 존재)에서
  `input.account`를 해석. `undecryptable`은 잡을 시끄럽게 실패시키고;
  `absent`/`expired`/`revoked`는 실제 매장을 전역 env 계정으로 조용히 폴백시키지
  않고 오너용 "재연결" 안내로 발행을 막는다.

### 토큰 수명주기

- **갱신 잡.** 스케줄 작업이 60일 만료 전에 `linked` 토큰을 갱신; 갱신 실패 시
  `status='expired'`로 전환. (캠페인 파이프라인이 이미 쓰는 잡 러너 재사용 — 빌드
  중 확인.)
- **폐기(revocation).** 발행 시점에 Meta가 auth 에러를 반환하면 `revoked`로
  전환하고 재연결 카드 노출. 오너 재연결 = 플로우 재실행.

### stub 모드

`APP_INTEGRATION_MODE=stub`는 전체 플로우를 데모 가능하게 유지한다: stub oauth
모듈이 결정적 가짜 code/token과 stub 핸들을 반환하므로, Meta 호출 없이 온보딩이
연결 상태를 끝까지 보여준다 — 두 앱 모두 실 자격증명 없이 완전 데모 가능해야
한다는 v2 제약과 일치.

## Meta 게이팅 (사업/운영 트랙 — 코드가 아니라 병행)

- **현재 개발 모드:** 앱 Roles 탭에 추가된 **Instagram Tester** 계정(≤25, 수락
  필수)만 인증 가능. 엄선한 파일럿 코호트엔 충분하지만 임의의 오너에겐 **불가**.
- **일반 출시를 위해:** `instagram_business_content_publish`(+
  `instagram_business_basic`)에 대한 **App Review / Advanced Access**가 필요하고
  앱을 **Live 모드**로 전환해야 함. 이것이 "파일럿"을 "누구나 연결"로 바꾸는 게이트.
- 각 매장 인스타는 **비즈니스/크리에이터**여야 함(위 프로페셔널-계정 UX).

## 빌드 슬라이스 (점진적, 각각 배포 가능 + stub 뒤 dormant)

1. **OAuth 모듈 + env + stub/prod 어댑터** — `instagram-oauth`(start URL,
   code→단기→장기, refresh, identity), 컨트랙트 + 테스트, UI 없음. Dormant.
2. **연결 라우트** — `store_channel_links`를 기록하는 `start` + `callback`;
   소유권 + state 쿠키 강제; 에러→상태 매핑. 리퀘스트-스펙 테스트로 커버.
3. **온보딩 카드 + 상태** — connect / connected / needs-professional /
   expired-reconnect, `onboarding-gbp-panels.tsx` + `onboarding-model.ts` 패턴;
   발행 해석을 저장된 링크에 배선.
4. **갱신 잡 + 폐기 처리.**
5. **(운영, 병행) App Review 제출 + Live 모드.**

## 열린 질문

- **개인 vs 프로페셔널을 더 일찍 감지?** 동의 실패 전에 전환을 유도할 수 있는
  사전 신호(챗, 네이버 데이터)가 있는가? 첫 시도 성공률을 크게 개선.
- **갱신 스케줄 위치:** 기존 잡 러너가 60일 갱신을 호스팅할 수 있는지, 아니면
  가벼운 cron이 필요한지 확인.
- **설정 표면:** 온보딩에서만 연결할지, 만료 후 재연결용 "채널 관리" 화면도 둘지?
  (둘 다 쪽으로 기움.)
- **전역 env 계정:** 우리 데모/파일럿 인스타용 env 폴백은 유지하되, _실제_ 매장이
  거기로 폴백해도 되는가? (설계상 아니오 — 막는다.)

## 성공 기준

- 파일럿 오너가 온보딩 카드에서 ≤3탭으로 매장 인스타를 연결하고, 토큰은 절대
  보이지 않는다.
- 개인 계정 오너가 전환으로 유도되어 재시도에서 연결을 완료하며, 원시 Meta 에러를
  보지 않는다.
- 연결된 매장의 승인된 게시물이 저장된 매장별 토큰으로 자기 인스타에 발행되고,
  만료된 토큰은 조용한 실패나 오발행 없이 재연결을 유도한다.
- 전체 플로우가 `APP_INTEGRATION_MODE=stub`에서 데모 가능.
