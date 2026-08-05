# v2 프로덕션 컷오버 체크리스트

> **English:** [v2-production-cutover.md](./v2-production-cutover.md)

v2 프로그램(하나의 Postgres 위 오너 앱 + 운영자 콘솔)의 라이브 전환 체크리스트.
기존 배포 런북을 반복하지 않고 **조합**합니다 — 상세 절차는 링크를 따라가세요:

- 두 Vercel 프로젝트 & 호스트명 함정: [vercel-two-projects.ko.md](./vercel-two-projects.ko.md)
- 마이그레이션 순서 & `db:pg:verify` 게이트: [migration-runbook.ko.md](./migration-runbook.ko.md)
- 백업 / 복원 / 롤백 / 관측성: [postgres-backup-restore-rollback-observability.ko.md](./postgres-backup-restore-rollback-observability.ko.md)
- 스테이징 컷오버 리허설(먼저 이것부터): [postgres-staging-cutover-rehearsal.ko.md](./postgres-staging-cutover-rehearsal.ko.md)

## 선결 조건

- [ ] Phase 0–5가 `main`에 머지됨; 머지 커밋에서 CI(lint, typecheck, test, e2e,
      build) 그린.
- [ ] `postgres-staging-cutover-rehearsal.md`에 따라 Neon에서 스테이징 컷오버
      리허설 완료, 증거 캡처됨.
- [ ] 프리뷰 배포에서 Phase 5 데모 시드에 대해 두 앱 브라우저 QA 패스 — Queue,
      Inbox, Stores가 콘솔/네트워크 오류 없이 렌더링(`docs/v2/ops-runbook.md`
      참고).
- [ ] 모든 프로덕션 마이그레이션 직전에 백업 확보
      (`postgres-backup-restore-rollback-observability.md` §Backup Policy).

## 프로젝트 (2026-07-17 결정 — 재도출 금지)

이 레포에서 배포하는 Vercel 프로젝트는 **하나뿐**입니다. 프로덕션 별칭은
**`https://glocalx-mvp-six.vercel.app`**이며, `glocalx-mvp.vercel.app`이
_아닙니다_(그 호스트명은 동결된 v1 프로젝트에 속하며 모든 실제 v2 라우트에서
404를 냄). 전체 표와 `-six` 설명은
[vercel-two-projects.ko.md](./vercel-two-projects.ko.md)에 있습니다.

| 프로젝트                             | 역할                                                | 루트 디렉터리    |
| ------------------------------------ | --------------------------------------------------- | ---------------- |
| `glocalx-mvp` (admin-10456072s team) | 레포-연결 오너 앱; `main` → prod + PR 프리뷰        | `apps/owner-app` |
| `glocalx-admin`                      | 운영자 콘솔; `main` → prod + PR 프리뷰              | `apps/admin`     |
| `glocalx-mvp-private`                | Git-분리됨; 구매한 도메인 보유; 의도적으로 프로모트 | —                |

## 환경 변수 매트릭스

두 프로젝트는 **같은** Postgres가 필요합니다. **Production + Preview**에 설정.
실제 값을 절대 커밋하지 말고 Vercel 대시보드에서 설정하세요.

### 두 프로젝트 공통

| 변수                   | 값 / 비고                                         |
| ---------------------- | ------------------------------------------------- |
| `DATABASE_PROVIDER`    | `postgres` (모든 Vercel 런타임에서 필수)          |
| `DATABASE_URL`         | 풀링된 Neon URL (런타임)                          |
| `DATABASE_URL_DIRECT`  | 다이렉트/언풀 Neon URL (마이그레이션 & 운영 전용) |
| `APP_INTEGRATION_MODE` | 오늘은 `stub`. 변경 전 아래 플립 주의를 볼 것.    |

### 오너 앱 (`glocalx-mvp`) — 추가

| 변수                                                                           | 값 / 비고                                     |
| ------------------------------------------------------------------------------ | --------------------------------------------- |
| `TOKEN_ENCRYPTION_KEY`                                                         | 필수. 오너 OAuth 토큰을 정지 상태에서 암호화. |
| `POST_MEDIA_SIGNING_KEY`                                                       | 필수. 미디어 URL 서명.                        |
| `BLOB_READ_WRITE_TOKEN`, `BLOB_PUBLIC_HOST`                                    | Vercel Blob (캠페인 미디어).                  |
| `PUBLIC_APP_URL`                                                               | `-six` 프로덕션 URL (OAuth 리다이렉트, 링크). |
| `NEXT_PUBLIC_APP_NAME`                                                         | 표시 이름.                                    |
| **프로덕션 모드 전용** (스텁에서는 전부 blocked-by-credentials):               |                                               |
| `GOOGLE_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI`, `GOOGLE_BUSINESS_ACCOUNT_ID` | GBP + 구글 로그인                             |
| `KAKAO_REST_API_KEY` / `_CLIENT_SECRET` / `_REDIRECT_URI`                      | 카카오 로그인                                 |
| `NAVER_CLIENT_ID` / `_SECRET`                                                  | 네이버 사업자 정보 추출                       |
| `OPENAI_API_KEY` (+ `OPENAI_*_MODEL`)                                          | 온보딩 / 마케팅 / 이미지 AI                   |
| `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`                                  | Instagram 게시                                |
| 조직 게시 크레덴셜 (`org_credentials`, `google_org`)                           | GBP는 오너 토큰이 아니라 조직 계정에서 게시   |

### 어드민 (`glocalx-admin`) — 추가

어드민은 DB 기반 세션을 쓰며 인증 시크릿 env가 필요 없습니다. 운영자를
셸에서 시드(`seed:admin`, 런북 참고). 통합 키 없음 — 콘솔은 구글/Instagram을
직접 호출하지 않습니다.

## 마이그레이션 순서 (타협 불가)

어느 앱도 런타임에 마이그레이션하지 않습니다. `db:pg:migrate`는 **스키마 변경당
정확히 한 번**, PM/창업자가 `DATABASE_URL_DIRECT`로, 스키마를 담은 PR을 **머지하기
전에** 실행합니다; CI가 `db:pg:verify`를 강제합니다. 전체 절차와 적용-마이그레이션
로그: [migration-runbook.ko.md](./migration-runbook.ko.md).

```bash
DATABASE_URL_DIRECT=postgres://... npm run db:pg:migrate
DATABASE_URL_DIRECT=postgres://... npm run db:pg:verify
```

초기 컷오버의 대상 스키마는 **0014**(`gbp_access_requests`)입니다. 배포 전
`db:pg:verify`가 예상 테이블 수를 보고하는지 확인하세요.

선택적으로 데모용으로 데모 코호트를 **스테이징** DB에 시드:
`DATABASE_URL_DIRECT=... npm run db:pg:seed`(멱등 — 두 번 실행해도 안전). 실제
프로덕션 DB에는 **절대** 데모 데이터를 시드하지 마세요.

## 스텁 → 프로덕션 통합 플립 (플립 전 필독)

`APP_INTEGRATION_MODE=stub`이 현재 프로덕션 값이며 v2 시스템 전체가 그 위에서
돕니다 — 모든 네이버 추출, 채팅 작성, GBP 설정, 게시가 결정적 스텁을 반환합니다.
**오늘 `production`으로 플립하면 온보딩, 채팅, 게시가 깨집니다** — 활성화되는 게
아니라 — 위의 채널 크레덴셜이 아직 구성되지 않았기 때문입니다. 프로덕션 어댑터는
안전하게 실패합니다: 누락된 크레덴셜은 크래시 대신 통제된 `blocked_by_credentials`
결과를 반환하지만, 오너-가시 흐름은 여전히 멈춥니다.

채널별로, 크레덴셜이 존재하고 **또한** 어댑터가 프리뷰에서 검증됐을 때만
`production`으로 플립하세요:

1. 채널의 크레덴셜을 오너 프로젝트에 설정(Preview 먼저).
2. `APP_INTEGRATION_MODE=production`으로 프리뷰 배포.
3. 프리뷰에 대해 그 채널의 흐름을 실행; 실제 호출이 성공하는지
   확인(`blocked_by_credentials` 아님).
4. 그런 다음에만 Production에 `APP_INTEGRATION_MODE=production` 설정.

프로덕션 모드에 네이버 크레덴셜이 없으면 프리뷰가 스텁 네이버 어댑터로
폴백하므로(`runtime-diagnostics.ts`), 프리뷰가 부분적으로 라이브일 수 있습니다.
각 채널의 라이브-준비 상태를 명시적으로 추적하세요.

## 롤백 태세

[postgres-backup-restore-rollback-observability.ko.md](./postgres-backup-restore-rollback-observability.ko.md)에 따라:

- **앱 롤백:** Vercel에서 이전 프로덕션 배포를 재배포(`packages/*` 변경이
  나갔다면 두 프로젝트 모두 — 둘 다 리빌드됨).
- **스키마 롤백:** 마이그레이션 전 백업에서 복원(§Rollback Checklist). 전진 전용
  마이그레이션이므로 down-마이그레이션이 없음 — 되돌리지 말고 복원하세요.
- **`db:pg:reset`은 프로덕션 유사 환경에서 리셋 가드에 의해 차단됨.** 프로덕션
  리셋을 시도하지 말고, 대신 백업에서 복원하세요.
- 컷오버 후 관측성 + 보안 검사(§Observability)를 지켜보세요.

## Go / No-Go

**Go** 조건: `main`에서 CI 그린; 두 프로젝트에 env 매트릭스 완비; 마이그레이션
적용 및 `db:pg:verify` 클린; 백업 확보; 프리뷰에서 QA 패스 클린; 롤백 계획 확인.

**No-Go** 조건(하나라도): `db:pg:verify` 불일치; 필수 오너-앱 시크릿 누락; 최신
백업 없음; `-six` 별칭이 앱을 서빙하지 않음; 또는 채널별 크레덴셜 검증 없이
`APP_INTEGRATION_MODE=production`으로 플립 시도(백업/롤백 런북의 No-Go Conditions
참고).

## 컷오버 시퀀스

1. `main` 머지 동결.
2. 프로덕션 Postgres 백업 확보.
3. `DATABASE_URL_DIRECT`로 `db:pg:migrate` + `db:pg:verify` 실행.
4. 두 Vercel 프로젝트(Production + Preview)의 env 매트릭스 확인.
5. `main` 머지/배포; `glocalx-mvp-six.vercel.app`이 오너 앱을 서빙하고 어드민
   프로젝트가 `/api/health`를 정상 서빙하는지 확인.
6. 프로덕션에 대해 운영자 최소 한 명 시드(`seed:admin`).
7. 스모크 테스트: 오너 로그인 → 온보딩, 운영자 콘솔 → Queue / Inbox / Stores
   로드. (스텁 모드: 흐름은 시뮬레이션됨.)
8. 동결 해제. 첫날은 롤백 계획을 가까이 두세요.
