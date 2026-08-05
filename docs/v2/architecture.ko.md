# GlocalX v2 — 아키텍처

> **English:** [architecture.md](architecture.md)

상태: 제안됨
날짜: 2026-07-16
동반 문서: [README.ko.md](README.ko.md) (범위), [delivery-plan.ko.md](delivery-plan.ko.md) (단계 구성)

## 1. 배포 토폴로지

결정 (창업자 확인 2026-07-16): **하나의 모노레포, 두 개의 Next.js 앱, 두 개의
Vercel 프로젝트, 하나의 공유 Neon Postgres.**

```
glocalx-mvp/
├── apps/
│   ├── owner-app/        # today's src/ app, moved — owner-facing, mobile-first
│   └── admin/            # new — internal operations dashboard
├── packages/
│   ├── db/               # migrations, connection factory, repositories
│   ├── domain/           # schemas, state machines, post-flow, campaign logic
│   ├── integrations/     # adapter contracts + stub/production implementations
│   └── ui/               # design tokens + shared primitives (theme parity)
├── docs/
└── package.json          # npm workspaces root
```

| 속성                 | owner-app                                          | admin                                     |
| -------------------- | -------------------------------------------------- | ----------------------------------------- |
| Vercel 프로젝트      | 기존 (`glocalx-mvp`)                               | 신규 (`glocalx-admin`)                    |
| Vercel 루트 디렉터리 | `apps/owner-app`                                   | `apps/admin`                              |
| 브랜치 매핑          | GitHub Flow: `main` → prod, PR별 프리뷰가 스테이징 | 동일 흐름, 자체 URL                       |
| 대상 독자            | 매장 오너 (공개)                                   | 운영자 전용 (초대 게이트)                 |
| 세션 쿠키            | 기존 오파크(opaque) 오너 세션                      | 별도 어드민 세션 (다른 이름, 다른 테이블) |
| 데이터베이스         | 공유 Neon Postgres (풀링된 `DATABASE_URL`)         | 동일 DB, 동일 규칙                        |

v1 ADR에서 변동 없이 이어지는 규칙
(`docs/architecture/v2-postgres-architecture.md`):

- 모든 Vercel 런타임은 `DATABASE_PROVIDER=postgres`와 풀링된 `DATABASE_URL`,
  그리고 마이그레이션/운영용 다이렉트 URL을 요구합니다. SQLite는 로컬-개발/테스트
  전용으로 유지됩니다.
- `LISTEN/NOTIFY`, 세션 레벨 `SET`, 지속 세션을 가정하는 prepared statement 금지
  (Neon 풀링 제약). 이것이 채팅이 폴링을 쓰는 이유 중 하나입니다 (§5).
- `APP_INTEGRATION_MODE`이 **두** 앱 모두에서 스텁 vs 프로덕션 어댑터를
  선택합니다. 프로덕션 배포를 제외한 모든 곳에서 스텁이 기본값입니다.

### 왜 `/admin` 라우트를 가진 단일 앱이 아닌가

분리는 창업자의 결정이었습니다. 엔지니어링적 정당성: 어드민 앱은 조직 계정
크레덴셜(GBP 조직 OAuth, 플랫폼 게시 토큰)과 공개 번들에 절대 실려서는 안 되는
운영자 도구를 갖고, 독립적인 배포 주기를 원하며, 다른 위협 가정을 가진 인증
시스템(공개 가입 없음, 허용목록만)을 필요로 합니다. 하나의 레포에 두 개의
프로젝트를 두면 그 격리를 얻으면서 `packages/*`가 스키마/로직 드리프트를
막습니다.

### 워크스페이스 메커니즘

- npm 워크스페이스 (이미 npm 사용 중; 새 패키지 매니저 없음).
- `packages/*`는 경로 별칭(path alias)을 통해 TypeScript 소스로 소비됩니다 —
  빌드/퍼블리시 단계 없음. 각 앱의 `tsconfig`가 공유 베이스를 확장합니다.
- **두 앱 모두 모든 공유 패키지를 `transpilePackages`에 나열해야 합니다**
  (next.config) — Next.js는 이것 없이는 앱 디렉터리 밖의 TypeScript를 컴파일하지
  않으며, 빠진 항목은 앱 외부 문법 오류로 Vercel 빌드를 실패시킵니다.
- **레포 전체에서 정확히 하나의 `react`/`react-dom`/`next` 버전**을 두 앱에
  동일하게 선언해 npm이 단일 사본을 호이스트하도록 합니다. Phase 0 수용 기준에는
  `npm ls react`가 하나의 해석된 버전을 보고하는 것이 포함됩니다 — 중첩된 중복은
  빌드는 통과하지만 런타임에 크래시합니다("Invalid hook call").
- **Vercel의 프로젝트별 Ignored Build Step:** owner-app은 `apps/owner-app/` 또는
  `packages/` 하위 변경 시에만 빌드하고, admin은 `apps/admin/` 또는 `packages/`
  변경 시에만 빌드합니다. packages/ 트리거를 잘못 설정하면 오래된 공유 코드를
  서빙하게 되므로 — 두 규칙에 모두 포함하세요.
- 기존 루트 스크립트는 얇은 위임자(`npm run dev -w owner-app`)가 되고, CI가 모든
  워크스페이스에 대해 typecheck/lint/test를 실행합니다.

## 2. 데이터 모델 추가

모든 신규 테이블은 `packages/db`의 기존 마이그레이션 관례를 따릅니다(순서 있는 SQL
마이그레이션; Postgres 우선 시맨틱; apply-on-open은 SQLite 개발 경로 전용임에
유의 — Postgres는 오직 `db:pg:migrate`로만 마이그레이션). 기존 테이블(users,
sessions, stores, oauth identities, GBP accounts/locations, post drafts, publish
attempts, audit logs)은 분기(fork)하지 않고 재사용합니다.

**두 앱에 걸친 마이그레이션 소유권:** 하나의 DB와 독립적으로 배포되는 두 앱으로,
`db:pg:migrate`는 스키마 변경당 정확히 한 번 실행됩니다 — 이름 붙은 런북 단계:
PM/창업자가 스키마를 담은 PR을 _머지하기 전에_ 다이렉트 URL로 실행하고, CI가
`db:pg:verify`를 강제해 드리프트가 파이프라인을 실패시킵니다. 앱 런타임에서는
절대 안 됩니다. CI 자동 마이그레이션은 팀이 커질 때까지 의도적으로 미룹니다. 모든
마이그레이션은 **expand-contract**입니다: 가산적 변경(신규 테이블/컬럼, 처음엔
nullable)은 자유롭게 들어가고, 이름 변경·삭제·기존 컬럼의 새 제약은 두 앱 모두
옛 형태를 더 이상 필요로 하지 않는 코드를 돌린 뒤 한 릴리스 후에만 나갑니다.
이렇게 하면 아직 재배포되지 않은 앱이 모든 배포 창 동안 올바르게 서빙합니다.

### 어드민 아이덴티티

```
admin_users        id, email (unique), password_hash, display_name,
                   role ('operator' | 'owner'), status, created_at
admin_sessions     id (opaque), admin_user_id, expires_at, created_at
```

- 공개 등록 라우트 없음. 어드민은 스크립트/초대로 시드됩니다.
- 오너 세션 설계(오파크 DB 기반 id, 만료)를 미러링하되, 별도 테이블과 별도 쿠키
  이름을 사용해 유출된 오너 세션이 어드민 스코프로 해석될 수 없고, 그 반대도
  마찬가지입니다.

### CS 채팅

```
cs_conversations   id, store_id (FK stores), mode ('ai' | 'human'),
                   status ('open' | 'resolved'), assigned_admin_id NULL,
                   created_at, updated_at
cs_messages        id, conversation_id, sender ('owner' | 'assistant'),
                   author_kind ('user' | 'ai' | 'admin'),
                   author_admin_id NULL, body, created_at,
                   owner_read_at NULL, admin_read_at NULL
cs_message_context id, message_id, section, stage,
                   activity_trail (jsonb), captured_at
```

기존 온보딩-대화 스택과의 경계: `cs_*` 테이블은 v1의 `conversations`와 의도적으로
분리되어 있습니다(다른 생명주기, 다른 소비자 — 온보딩 턴은 경계가 있는 흐름이고,
CS 채팅은 모드 전환과 읽음 확인이 있는 개방형). 공유되는 것은 한 번만 존재합니다:
응답 작성, 메시지 형태 타입, OpenAI 어댑터가 `packages/domain` /
`packages/integrations`에 있고 두 스택이 소비합니다. 작성 로직을 CS 스택에
복제하는 것도, 두 테이블을 통합하는 것도 허용되지 않습니다.

핵심 설계 포인트: `sender`는 **오너가 보는 것**(항상 하나의 "assistant"
페르소나)이고, `author_kind`는 **운영 측이 아는 것**(AI인지 이름 있는 어드민이
실제로 썼는지)입니다. 대화의 `mode`를 바꾸면 다음 어시스턴트 메시지를 누가
생성하는지가 바뀝니다 — 오너는 이음매 없이 하나의 연속된 어시스턴트를 경험합니다.

폴링 경로 인덱스는 해당 테이블과 같은 마이그레이션에서 나갑니다 — 폴링 전송이
이들을 영구적인 핫 패스로 만듭니다:
`cs_messages(conversation_id, id)` (커서 읽기),
`cs_conversations(status, updated_at)` (인박스 정렬),
`activity_events(store_id, created_at)` (매장 타임라인),
`campaign_requests(status, updated_at)` (큐 칸반).

### 활동 텔레메트리

```
activity_events    id, store_id, session_id, section, action,
                   detail (jsonb, whitelisted keys only), created_at
```

- 오너 앱은 화면/섹션 전환과 이름 붙은 행동(예: `gbp_connect_started`,
  `campaign_upload_failed`)을 기록합니다 — 자유 텍스트, 키 입력, 크레덴셜 자료는
  절대 아님 (§7).
- 가장 최근 N개 이벤트(클라이언트측 링 버퍼, ~20)가 각 발신 채팅 메시지에
  `cs_message_context.activity_trail`로 첨부되고, 대시보드의 매장 타임라인을 위해
  주기적으로 `activity_events`에 플러시됩니다.

### 마케팅 소재 파이프라인

```
campaign_requests  id, store_id, brief (text), status, created_at, updated_at
                   status: 'submitted' → 'in_production' → 'ready_for_review'
                           → 'approved' | 'changes_requested' | 'rejected'
                           → 'publishing' → 'published' | 'partially_published'
                           → 'failed'
campaign_assets    id, request_id, kind ('original' | 'processed'),
                   blob_url, content_type, width, height, meta (jsonb),
                   uploaded_by ('owner' | 'admin'), created_at
campaign_review_events
                   id, request_id, actor ('owner' | 'admin'),
                   decision ('go' | 'no_go' | 'changes_requested'),
                   note, created_at
publish_jobs       id, request_id, channel ('gbp' | 'instagram' | …),
                   status ('queued' | 'publishing' | 'published' | 'failed'),
                   external_ref NULL, attempt_count, last_error NULL,
                   idempotency_key, created_at, updated_at
```

- `publish_jobs`는 v1의 publish-attempt 시맨틱을 재사용합니다: (request, channel)
  당 멱등 키, 이력 보존, GBP 위치가 검증될 때까지 라이브 액션 차단
  (`src/gbp/state-machine.ts` 로직이 `packages/domain`으로 이동).
- **재시도 정책:** 재시도는 운영자 트리거(대시보드 액션)이며 절대 자동이
  아닙니다 — 잡당 최대 3회, 시도 간 멱등 키 고정. 세 번째 실패 후 잡은 종료
  실패 상태로 잠기고, 큐가 이를 표면화하며, 매장의 대화에 어시스턴트 메시지가
  들어가 오너가 조용히 기다리지 않게 합니다. v1의 ChannelPublishAction "반복 실패
  후 수동 후속조치" 상태를 미러링합니다.
- 상태 머신은 라우트 핸들러에 흩어지지 않고 `packages/domain`(단일 전이 함수)에서
  강제됩니다 — 이것이 "자동화 다이얼"입니다: 각 전이의 트리거가 이후 상태를 건드리지
  않고 운영자 클릭에서 자동 워커로 바뀔 수 있습니다.

### 조직 게시 크레덴셜

v1은 _오너의_ 구글 토큰과 하나의 전역 Instagram env 토큰으로 게시합니다. v2는
이를 뒤집습니다: 조직 계정이 여러 매장의 GBP 위치에 게시하고, 각 매장은 자체
Instagram 비즈니스 계정을 연결할 수 있습니다. 이는 재사용이 아니라 자체
워크스트림입니다:

```
org_credentials    id, provider ('google_org' | 'meta_app'),
                   encrypted_token, encrypted_refresh_token,
                   expires_at, scopes, updated_at
store_channel_links id, store_id, channel ('instagram' | …),
                   external_account_ref, encrypted_token NULL,
                   status ('linked' | 'expired' | 'revoked'), created_at
```

- 토큰은 기존 `TOKEN_ENCRYPTION_KEY` 메커니즘으로 암호화되며, **어드민 앱에서만**
  저장·사용됩니다(오너 앱은 절대 읽지 않음).
- 리프레시 처리는 게시 경로의 일부입니다: 만료된 조직 토큰은 잡을
  `blocked_by_credentials` 결과로 실패시킵니다(v1 패턴). 조용한 재시도 루프는
  절대 아닙니다.
- **외부 리드타임은 Phase 3가 아니라 지금 시작됩니다:** 조직 구글 계정 GBP OAuth
  클라이언트 설정, 그리고 비즈니스 계정 대행 게시를 위한 Meta 앱 심사(역사적으로
  수 주 소요)는 Phase 0와 함께 1주차에 시작하는 운영 태스크입니다.

### GBP 조직 접근

```
gbp_access_requests id, store_id, gbp_location_ref, state
                    ('not_requested' | 'invited' | 'pending' | 'granted'
                     | 'revoked' | 'blocked'), requested_at, granted_at,
                    note
```

매장별로 조직 계정의 관리자 접근 요청을 추적합니다. **v2에서 상태 전이는 운영자
액션입니다**(`audit_logs`로 감사됨) — 승인 자체는 주로 운영자가 오너와 채팅으로
진행하는 구글 측 흐름입니다(주 온보딩 경로). v2에는 자동 구글 폴링이 없습니다.
GBP Account Management API가 신뢰할 수 있는 자동 승인 감지를 지원하는지는 스파이크
전까지 열린 질문입니다(§9). v1 위치-검증 상태 머신
(`src/gbp/state-machine.ts`)은 계속 _게시_ 자격을 게이팅하며 이 테이블과는
무관합니다.

## 3. 오너 앱 v2 화면

v1에서 유지(이동, 재작성 아님): 진입/로그인(구글 우선; 개발용으로 이메일 유지),
온보딩 셸, `MobileShell` 레이아웃 시스템, 세션 처리, GBP OAuth + 설정 흐름.

변경:

- **내비게이션이 다음으로 축소됩니다:** 홈/상태, 마케팅(인테이크 + 승인),
  리뷰(스텁), 실적(스텁). v1의 포스트 컴포저 UX(개선 판단, 채널 선택기)는 오너
  화면에서 제거됩니다 — 그 판단은 대시보드로 이동합니다.
- **마케팅 인테이크:** 1–10장의 이미지 + 짧은 브리프("무엇을 어떻게 홍보할지")
  업로드. `submitted` 상태의 `campaign_request`를 생성합니다. 오너는 요청별 상태
  타임라인과, 소재가 `ready_for_review`로 돌아올 때의 **go/no-go 리뷰
  화면**(승인, 노트와 함께 변경 요청, 반려)을 봅니다.
- **채팅 위젯:** 모든 인증 화면의 하단 모서리에 플로팅 버튼; 사이드/오버레이
  패널을 엽니다(모바일: 전체 높이 시트). DESIGN.md 토큰을 따릅니다. 활동-트레일
  맥락과 함께 메시지를 보내고, 응답을 폴링합니다(§5). 매장당 한 번에 하나의 열린
  대화.
- **리뷰 & 실적:** 기존 컴포넌트가 스텁 데이터 위에 마운트된 상태로 유지됩니다.
  새 작업 없음; 코드와 UI 문구에 명시적으로 스텁으로 표시됩니다.

## 4. 어드민 대시보드 화면

신규 Next.js 앱, 데스크톱 우선, 동일 디자인 토큰(어두운 캔버스 `--canvas`, 오렌지
`--accent`)을 밀도 높은 운영 테마로 렌더링 — 오너 앱의 모바일 셸을 복제한 것이
아니라 시각적으로 형제뻘입니다.

섹션:

1. **Stores** — 목록 + 상세: 오너 신원, GBP 연결 상태(`gbp_access_requests`),
   활동 타임라인(`activity_events`), 열린 대화, 캠페인 이력.
2. **Inbox (채팅 콘솔)** — awaiting-reply 순으로 정렬된 대화 목록; 대화 뷰는
   메시지 **와 맥락 패널**을 보여줍니다: 각 메시지에 대해 오너가 있던 섹션/단계와
   최근 행동 트레일 — 그래서 운영자가 묻지 않고 진단합니다. 컨트롤: AI/휴먼 모드
   토글(대화별), assign-to-me, resolve. AI 모드에서는 콘솔이 AI 응답을 실시간으로
   보여주고, 운영자가 휴먼 모드로 전환하면 대화 도중에 이어받습니다.
3. **Production queue (캠페인)** — `campaign_requests.status`별 칸반. 운영자가
   요청을 열어 원본 + 브리프를 보고, 가공 애셋을 업로드하고, 최종 카피를 쓰고,
   `ready_for_review`로 옮깁니다(오너 앱에 알림). 오너의 `go` 이후, 게시 패널이
   선택한 채널별로 `publish_jobs`를 생성하고 채널별 상태/이력을 보여줍니다.
4. **Settings** — 어드민 사용자 관리(owner 역할만), 통합 진단(v1 진단 패턴
   재사용).

## 5. 채팅 전송: 폴링

결정 (창업자 확인): **폴링**, realtime 벤더 없음.

- 오너 위젯은 패널이 열려 있는 동안 `GET /api/chat/messages?after=<cursor>`를
  3초마다, 닫혀 있는 동안 30초마다(배지만) 폴링합니다.
- 대시보드 인박스는 요약 엔드포인트를 5초마다 폴링하고, 열린 대화는 3초마다
  폴링합니다.
- 근거: Vercel 서버리스 + Neon 풀링은 장기 연결과 `LISTEN/NOTIFY`를 불가능하게
  합니다; 10–20개 매장 규모의 CS 채팅은 몇 초의 지연을 견딥니다; 새 벤더나
  크레덴셜이 전혀 없습니다.
- 메시지 저장소는 절대 push를 가정하지 않습니다. 규모가 요구하면, 매니지드
  realtime 계층(예: Pusher/Ably)을 같은 테이블 위에 알림 힌트로 추가합니다 —
  클라이언트는 여전히 커서 엔드포인트로 조정하므로 마이그레이션이 없습니다.

### AI 응답기

대화가 `ai` 모드일 때, 메시지 생성 핸들러는 오너의 메시지를 저장하고 즉시
반환합니다 — 작성(composition)은 절대 오너의 POST 안에서 실행되지 않습니다.
응답(또는 "AI가 초안, 운영자가 발송" 태세에 따른 운영자용 초안)은 기존 OpenAI
어댑터 경계(`openai-conversation.ts` 패턴)를 통해 `waitUntil`로 대역 밖에서
작성되며, 시스템 프롬프트는 매장 프로필, GBP 연결 상태, 캠페인 상태, 메시지의
활동 트레일로 구성됩니다. 오너의 폴링 루프가 다음 틱에 응답을 전달하므로, 발송
지연은 OpenAI 지연과 독립적이고 실패한 작성이 오너의 발송을 모호하게 만들 수
없습니다. 스텁 모드는 결정적 정형(canned) 응답을 반환해 크레덴셜 없이도 채팅이
완전히 데모 가능합니다. AI 실패는 정중한 "팀이 곧 답변드리겠습니다" 어시스턴트
메시지로 격하되고 대시보드에서 대화를 플래그합니다 — 절대 조용히 드롭하지
않습니다.

## 6. 미디어 저장소

오너 사진 업로드와 운영자 가공 애셋은 **Vercel Blob**으로 갑니다(비공개 접근;
시간 제한 서명 URL을 클라이언트에 렌더링). 근거: 기존 Vercel 스택에서 무설정,
AWS 계정이나 크레덴셜 표면 없음. `packages/integrations`의 작은 `MediaStore`
계약 뒤에 래핑되어(스텁 구현 = 임시 디렉터리 하위 로컬 파일시스템) 테스트와 스텁
모드가 절대 네트워크를 건드리지 않으며, 이그레스 경제성이 바뀌면 S3가 스왑인으로
남습니다. 업로드 한도: 요청당 이미지 10장, 이미지당 10MB, 콘텐츠 타입
화이트리스트(jpeg/png/webp/heic).

**Instagram 게시 URL:** Meta의 Graph 흐름은 당신이 제공하는 URL에서 포스트
이미지를 가져옵니다. 게시 경로는 게시 시도당 ~1시간 TTL의 새 서명 URL을
발급합니다(재시도마다 자체 발급) — 애셋은 정지 상태에서 비공개로 남고, 임시
가독성 창은 어차피 곧 공개될 콘텐츠를 덮습니다.

**업로드는 클라이언트 직접이며, 절대 라우트 핸들러를 거치지 않습니다** — Vercel
함수는 요청 본문을 4.5MB로 제한하는데, 이는 일반 폰 사진보다 작습니다. 흐름:
라우트 핸들러가 오너를 인증하고, 요청별 한도를 강제하고, 수명이 짧은 스코프 Blob
클라이언트 토큰을 발급합니다; 브라우저가 Blob으로 직접 업로드합니다; 업로드
콜백이 `campaign_assets` 행을 등록하고, 서버가 애셋이 파이프라인에 보이기 전에
콘텐츠 타입과 크기를 재검증합니다. 스텁 `MediaStore`는 로컬 파일시스템에 대해
토큰 흐름을 흉내 내므로 클라이언트 코드 경로가 테스트에서 동일합니다.

## 7. 보안 & 프라이버시

- **세션 격리:** 별도 쿠키 이름, 별도 테이블, 별도 앱. 어드민 라우트는 어드민
  세션만 검증하고, 오너 라우트는 오너 세션만 검증합니다. 두 가지를 모두 받는
  라우트는 없습니다.
- **조직 크레덴셜은 어드민 프로젝트의 env에만 존재합니다.** 오너 앱은 조직
  GBP/플랫폼 토큰을 절대 보유하지 않습니다. 게시는 어드민 앱 라우트 핸들러에서
  실행됩니다.
- **소유권 강제는 변동 없음:** 모든 오너 API 라우트가 세션 → 매장 소유권으로
  스코프합니다(v1 패턴, `packages/db` 리포지토리로 이동). 어드민 라우트는 모든
  상태 전이(모드 전환, 리뷰 판단, 게시)에 대해 actor + action을 기존 `audit_logs`
  테이블에 로깅합니다.
- **텔레메트리 최소화:** 활동 이벤트는 화면/섹션 ID와 고정 enum의 이름 붙은 행동
  상수만 기록합니다 — 자유 텍스트, 키 입력, 요청/응답 본문, 토큰 없음. enum은
  `packages/domain`에 있어 추가가 리뷰 가능합니다.
- **토큰 처리:** 프로바이더 토큰은 `TOKEN_ENCRYPTION_KEY`로 암호화된 채 유지됩니다
  (v1 메커니즘). Blob URL은 서명되고 수명이 짧습니다. 시크릿은 로그, 주석, 스텁
  픽스처에 절대 나타나지 않습니다.
- **레이트 리밋:** 메시지 생성과 업로드 엔드포인트는 매장별로 v1 인증-레이트-리밋
  테이블 패턴을 재사용합니다.

## 8. 통합 경계 (철학 불변)

`createIntegrationAdapters()`가 단일 이음매로 남습니다. v2는 다음 계약을
추가합니다: `MediaStore`, `CsAssistant`(AI 응답 작성), 그리고 멀티플랫폼 게시
잡을 위한 `ChannelPublisher` 확장. 모든 새 계약은 결정적 스텁을 먼저 내보내고,
프로덕션 구현은 크레덴셜이 존재할 때만 들어옵니다. Vercel 프리뷰 폴백(크레덴셜
없을 때 스텁)이 새 어댑터로 확장됩니다.

## 9. 열린 질문 (추적 중, 비차단)

- 자동 GBP 관리자-승인 감지: GBP Account Management API(초대/어드민 엔드포인트,
  쿼터, 조직 계정 제약 — 새로 부여된 관리자에 대한 구글의 제한 포함)를 스파이크한
  뒤에야 운영자-추적 상태를 넘는 자동화를 약속할 수 있습니다. Phase 4의 승인
  흐름이 완전한 셀프서브가 될 수 있는지도 이것이 결정합니다.
- 실제 고객 데이터가 흐르기 전 어드민 앱을 위한 커스텀 도메인 + IP 허용목록/SSO
  (목표: 첫 유료 코호트 전).
- 소재가 `ready_for_review`에 도달할 때 오너를 위한 푸시 알림(v2는 인앱 배지 +
  채팅 메시지로 출시; 이메일/카카오 알림은 빠른 후속).
- 연결된 IG 비즈니스 계정이 없는 매장을 위한 Instagram 게시 — 대시보드가 운영자가
  잡을 큐잉하기 전에 채널별 자격을 보여줘야 합니다(v1 자격 검사 재사용).
