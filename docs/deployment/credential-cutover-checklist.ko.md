# 채널별 자격증명(키) 발급 → 검증 체크리스트

> 대상: production(실사용자) 전환을 준비하는 운영자/창업자.
> 상위 절차 문서: [v2-production-cutover.ko.md](./v2-production-cutover.ko.md)

이 문서는 "어떤 키를 어디서 받아서 어디에 넣고, 진짜로 켜졌는지 어떻게
확인하는가"만 채널 단위로 다룹니다. 큰 그림(마이그레이션, 롤백 등)은
위 cutover 문서를 보세요.

## 핵심 원리 (먼저 이해하기)

- 앱은 환경변수 `APP_INTEGRATION_MODE` 하나로 **stub**(가짜 고정 응답) /
  **production**(실제 외부 호출) 을 전환합니다
  (`packages/integrations/src/index.ts`).
- production 어댑터는 **키가 없으면 죽지 않고**
  `blocked_by_credentials`("자격증명 없어서 막힘")를 돌려줍니다
  (`packages/integrations/src/credentials.ts`). 즉 키를 안 넣고 모드만
  바꾸면 그 기능이 **조용히 멈춥니다**.
- **중요한 함정:** 값이 비어 있거나 `replace-with-` 로 시작하면 코드가
  "없는 것"으로 취급합니다(`missingEnvVars`). placeholder를 넣어두면
  안 넣은 것과 같습니다.
- **안전한 전환 원칙:** 채널을 하나씩. ① Preview 환경에 키 넣기 →
  ② Preview를 `APP_INTEGRATION_MODE=production` 으로 배포 →
  ③ 그 채널 흐름을 실제로 눌러보고 진짜 응답 확인 → ④ 전부 통과한 뒤에야
  Production 환경 스위치를 켜기.

## 검증 공통 도구: 진단 엔드포인트

owner-app에 자격증명/모드 상태를 보여주는 엔드포인트가 있습니다:

- 경로: `/api/diagnostics/integrations` (또는 `/diagnostics/integrations` 페이지)
- **잠금:** 환경변수 `ENABLE_ADMIN_DEBUG=1`(또는 `true`)일 때만 열립니다.
  아니면 404. 확인이 끝나면 **다시 닫으세요**
  (`apps/owner-app/src/app/api/admin/integrations/route.ts`).
- 로그인 세션이 있어야 응답합니다.
- 지금은 `adapterMode`와 **Naver 자격증명 상태**를 자세히 보여줍니다.
  나머지 채널은 "실제 흐름을 눌러서 `blocked_by_credentials`가 아닌
  진짜 결과가 나오는지"로 검증합니다(각 채널 항목의 검증 방법 참고).

---

## Tier 0 — 인프라 (stub이든 production이든 무조건 필요)

모드와 무관하게 Vercel 런타임에서 항상 필요합니다.

| 환경변수                     | 용도                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `DATABASE_PROVIDER=postgres` | Vercel에선 SQLite 불가, Postgres 강제                                              |
| `DATABASE_URL`               | 런타임용 Neon 풀드(pooled) URL                                                     |
| `DATABASE_URL_DIRECT`        | 마이그레이션/운영용 다이렉트 URL                                                   |
| `TOKEN_ENCRYPTION_KEY`       | 소유자 OAuth 토큰을 저장 시 암호화 (`apps/owner-app/src/auth/token-encryption.ts`) |
| `POST_MEDIA_SIGNING_KEY`     | 미디어 URL 서명 (`apps/owner-app/src/posts/post-media.ts`)                         |
| `PUBLIC_APP_URL`             | OAuth 리디렉트/링크에 쓰는 `-six` 운영 URL                                         |
| `NEXT_PUBLIC_APP_NAME`       | 화면 표시 이름                                                                     |

- [ ] 위 값들이 **Owner 프로젝트**의 Production + Preview 양쪽에 설정됨
- [ ] `db:pg:migrate` + `db:pg:verify` 로 스키마 적용 확인 (cutover 문서)

---

## Tier 1 — 쉬움 (바로 발급, 심사 없음)

### 1) OpenAI — AI 온보딩 채팅 / 마케팅 글·이미지 생성

- **필요 키:** `OPENAI_API_KEY` (필수)
- **선택(모델 지정):** `OPENAI_MARKETING_MODEL`, `OPENAI_IMAGE_MODEL`,
  `OPENAI_CONVERSATION_MODEL`, `OPENAI_CONVERSATION_LIGHT_MODEL`,
  `OPENAI_ONBOARDING_SLOT_MODEL`, `OPENAI_CS_ASSISTANT_MODEL`
  (미설정 시 코드 기본값 사용)
- **근거:** `packages/integrations/src/openai-production.ts`,
  `openai-conversation.ts`, `openai-cs-assistant.ts`
- **발급처:** platform.openai.com → API keys
- **검증:** Preview(production 모드)에서 온보딩 채팅 또는 게시글 생성 실행 →
  **미리 정해둔 stub 문구가 아니라 매번 다른 실제 생성 결과**가 나오면 성공.

체크:

- [ ] `OPENAI_API_KEY` 설정 (Preview)
- [ ] 온보딩 채팅이 실제 응답 생성
- [ ] 마케팅 글/이미지 생성 성공

### 2) Naver — 온보딩 가게 정보 추출

- **필요 키:** `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`
- **근거:** `packages/integrations/src/naver-production.ts:19`
- **발급처:** developers.naver.com → 애플리케이션 등록 → "검색" API 사용
- **참고:** production 모드라도 Naver 키가 없으면 **Naver만 자동으로 stub**
  으로 폴백합니다(`runtime-diagnostics.ts`의 `shouldUsePreviewNaverStub`).
  그래서 "다른 채널은 라이브인데 Naver만 가짜"인 상태가 될 수 있으니 진단
  엔드포인트로 꼭 확인하세요.
- **검증:** 진단 엔드포인트에서 `selectedNaverSearch: "production"` 확인
  (`"stub-preview-missing-credentials"`이면 키 누락). 또는 온보딩에서 실제
  가게명을 검색해 진짜 결과가 나오는지 확인.

체크:

- [ ] `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` 설정 (Preview)
- [ ] 진단 엔드포인트 `selectedNaverSearch: "production"`
- [ ] 실제 가게 검색 결과 표시

### 3) Vercel Blob — 캠페인 이미지 저장

- **필요 키:** `BLOB_READ_WRITE_TOKEN`, `BLOB_PUBLIC_HOST`
- **근거:** `packages/integrations/src/vercel-blob-production.ts:25`
- **발급처:** Vercel 대시보드 → Storage → Blob 생성 (토큰 자동 발급)
- **참고:** Blob 스토어가 없으면 미디어도 stub으로 폴백
  (`shouldUsePreviewMediaStoreStub`).
- **검증:** Preview에서 게시글에 이미지 첨부/업로드가 실제 URL로 저장되는지.

체크:

- [ ] Blob 스토어 생성 + `BLOB_READ_WRITE_TOKEN` / `BLOB_PUBLIC_HOST` 설정
- [ ] 이미지 업로드 성공

---

## Tier 2 — 보통 (개발자 앱 등록 필요)

### 4) Kakao 로그인

- **필요 키:** `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI`
- **근거:** `apps/owner-app/src/auth/kakao-oauth.ts`,
  `apps/owner-app/src/app/api/auth/kakao/callback/route.ts`
- **발급처:** developers.kakao.com → 앱 생성 → 카카오 로그인 활성화 →
  REST API 키 / 보안(Client Secret) / Redirect URI 등록
- **주의:** `KAKAO_REDIRECT_URI`는 Kakao 콘솔에 등록한 값과
  **정확히 일치**해야 함. 운영은 `-six` 도메인 기준.
- **검증:** Preview에서 카카오 로그인 버튼 → 실제 카카오 동의 화면 →
  콜백으로 로그인 완료.

체크:

- [ ] Kakao 앱 등록 + 3개 키 설정
- [ ] Redirect URI가 콘솔 등록값과 일치
- [ ] 실제 카카오 로그인 왕복 성공

---

## Tier 3 — 어려움 (외부 심사/승인 필요, 리드타임 김)

> 이 두 채널은 코딩이 아니라 **플랫폼 심사**가 병목입니다. 신청을 **가장 먼저**
> 걸어두고, 승인 기다리는 동안 Tier 1~2를 진행하세요.

### 5) Google Business Profile(GBP) — 조직 계정 모델

GBP는 **조직 계정 1개**(GlocalX 소유 구글 계정이 모든 매장 위치를 대신
관리)로 라이브합니다. 매장주가 각자 구글 로그인/동의를 하지 않습니다.
서버가 조직 리프레시 토큰을 액세스 토큰으로 교환해서 GBP API를 호출합니다.

- **필요 키(실제로 코드가 읽는 것):**
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — OAuth 클라이언트
  - `GOOGLE_ORG_REFRESH_TOKEN` — 조직 계정의 리프레시 토큰(민감, write-only)
  - `GOOGLE_BUSINESS_ACCOUNT_ID` — 조직 계정 id(예: `117964535166689865393`;
    `accounts/` 접두사는 자동으로 붙음)
- **근거:** `packages/integrations/src/google-org-auth.ts`
  (`googleOrgAuthEnvVars`, `resolveGoogleOrgAccountName`),
  `apps/owner-app/src/gbp/setup-live.ts`(라이브 실행/파싱),
  `apps/owner-app/src/gbp/setup.ts`(production 분기)
- **필요 스코프:** `https://www.googleapis.com/auth/business.manage`
- **리프레시 토큰 발급(1회):**
  1. Google Cloud Console → OAuth 클라이언트(웹) 생성 → CLIENT_ID/SECRET
  2. **Google Business Profile API 접근 신청** + OAuth 동의 화면 심사(민감 스코프)
  3. OAuth Playground에서 위 클라이언트로 `business.manage` 동의 →
     조직 계정의 **refresh token** 획득 → `GOOGLE_ORG_REFRESH_TOKEN`에 저장
- **검증(코드 없이 실제 확인):** 스크래치패드의 `verify-gbp-org.mjs` 실행 —
  토큰 교환 → business.manage 계정 목록 조회 → 설정한 계정 id가 접근 가능한지
  확인(읽기 전용, 아무것도 생성 안 함). OpenAI/Naver 검증과 같은 방식.
- **동작:** production에서 매장 프로필 확정 후 GBP setup을 켜면, 조직 토큰으로
  실제 location을 조직 계정 아래 생성하고 실제 `google_location_id`/계정명을
  DB에 저장합니다. 새 위치는 `VERIFICATION_PENDING`으로 저장되며, verified 되기
  전엔 라이브 게시가 막힙니다.

체크:

- [ ] Google Cloud OAuth 클라이언트 생성 (CLIENT_ID/SECRET)
- [ ] GBP API 접근 승인 + 동의 화면 심사 통과
- [ ] 조직 계정 refresh token 발급 → `GOOGLE_ORG_REFRESH_TOKEN`
- [ ] `GOOGLE_BUSINESS_ACCOUNT_ID` 설정
- [ ] `verify-gbp-org.mjs` ✅ (토큰·계정 접근 확인)
- [ ] Vercel(preview)에 4개 키 등록 → GBP setup에서 라이브 location 생성 확인

> **알려진 한계(후속 작업):**
>
> - **게시(publish)는 아직 조직 토큰으로 전환 전** — 이번 슬라이스는 location
>   *생성*까지. 게시 라이브는 다음 슬라이스에서 (post-flow를
>   `readGbpPublishParent` + 조직 토큰 경로로 전환).
> - **setup row id가 전역 상수**(`setup-gbp-account`/`setup-gbp-location`)라
>   현재 라이브 setup은 **한 매장씩만** 안전합니다. 여러 매장을 동시에
>   온보딩하려면 store별 id로 바꾸는 후속 작업 필요.

### 6) Instagram 게시 (Meta Graph API)

- **필요 키:** `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`
- **근거:** `packages/integrations/src/instagram.ts:10` (Graph API v24.0)
- **발급/승인:**
  1. Meta for Developers → 앱 생성
  2. Instagram(Professional/Business 계정) 연결, 장기 액세스 토큰 발급
  3. 콘텐츠 게시 권한은 **앱 리뷰(심사)** 대상일 수 있음
- **검증:** Preview에서 실제 인스타 게시 → 반환된 permalink로 게시물 확인.

체크:

- [ ] Meta 앱 + 인스타 프로 계정 연결
- [ ] 장기 액세스 토큰 / USER_ID 확보
- [ ] 실제 게시 → permalink 확인

---

## 전체 전환 순서 (권장)

1. **Tier 3 신청 먼저 접수** (Google GBP, Meta — 승인 대기가 김)
2. Tier 0 인프라 확정 (Postgres + 필수 키) — 이건 stub 운영에도 필요
3. Tier 1 채널을 Preview에서 하나씩 라이브 검증 (OpenAI → Naver → Blob)
4. Tier 2 Kakao 로그인 검증
5. Tier 3 승인 도착 → Preview에서 검증
6. **모든 대상 채널이 Preview에서 통과**한 뒤에야 Production에
   `APP_INTEGRATION_MODE=production` 설정
7. cutover 문서의 Go/No-Go 게이트 통과 후 실사용자 오픈

## 진행 현황판 (복사해서 사용)

| 채널         | 키 발급 | Preview 설정 | 라이브 검증 | Prod 반영 |
| ------------ | ------- | ------------ | ----------- | --------- |
| Tier0 인프라 | ☐       | ☐            | ☐           | ☐         |
| OpenAI       | ☐       | ☐            | ☐           | ☐         |
| Naver        | ☐       | ☐            | ☐           | ☐         |
| Vercel Blob  | ☐       | ☐            | ☐           | ☐         |
| Kakao        | ☐       | ☐            | ☐           | ☐         |
| Google/GBP   | ☐       | ☐            | ☐           | ☐         |
| Instagram    | ☐       | ☐            | ☐           | ☐         |
