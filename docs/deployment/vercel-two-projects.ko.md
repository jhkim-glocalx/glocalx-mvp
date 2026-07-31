# Vercel 배선 — 두 프로젝트, 하나의 모노레포

> **English:** [vercel-two-projects.md](./vercel-two-projects.md)

Phase 0는 레포를 npm-워크스페이스 모노레포(`apps/owner-app`, `apps/admin`,
`packages/*`)로 바꿉니다. Vercel은 앱당 하나의 프로젝트가 필요합니다. 레포 측
구성(ignore 스크립트)은 커밋되어 있고, 아래 대시보드 단계는 운영자 액션이며
프로젝트 관리자가 한 번 수행해야 합니다.

## 프로젝트 레이아웃 (2026-07-17 결정)

세 개의 Vercel 프로젝트가 존재하지만, 이 레포에서 배포하는 것은 단 하나입니다:

| 프로젝트              | 팀                         | 역할                                                                                                      |
| --------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `glocalx-mvp`         | `admin-10456072s-projects` | **레포-연결됨.** `main` → **`glocalx-mvp-six.vercel.app`**과 PR별 프리뷰를 배포.                          |
| `glocalx-mvp-private` | `admin-10456072s-projects` | Git-분리됨. 구매한 고객 도메인 보유; 매 머지가 아니라 의도적으로 빌드를 프로모트.                         |
| `glocalx-mvp`         | `glocal-x`                 | 동결된 v1 스냅샷. **`glocalx-mvp.vercel.app` 호스트명을 전역적으로 소유** — 그 URL을 v2로 취급하지 말 것. |

> **프로덕션 URL 함정 (2026-07-25 검증).** 레포-연결 프로젝트의 공개 별칭은
> **`https://glocalx-mvp-six.vercel.app`**이며 `glocalx-mvp.vercel.app`이
> 아닙니다. 동결된 v1 프로젝트(`glocal-x` 팀)가 이미 평범한 호스트명을 점유했고
> `.vercel.app` 이름은 한 프로젝트에 전역적으로 고유하기 때문에 Vercel이 `-six`를
> 자동 접미했습니다. `glocalx-mvp.vercel.app`은 `/`에서 200을 반환하지만 모든 실제
> 라우트(`/login`, `/onboarding`, `/app`, …)에서 404를 냅니다 — 다른/오래된
> 빌드를 서빙 중. 깔끔한 커스텀 도메인이 붙기 전까지 배포를 검증하고 파일럿
> 유저에게 `-six` URL을 건네세요.

## 오너 앱 — 레포-연결 프로젝트 (`glocalx-mvp`)

1. Project → Settings → Build and Deployment → **Root Directory** →
   `apps/owner-app`으로 설정. "Include files outside the root directory"는
   **활성** 유지(앱이 `packages/*` 소스를 임포트함).
2. 같은 화면 → **Ignored Build Step** → Custom:
   `bash ../../vercel-ignore-step.sh apps/owner-app`
   (스크립트는 레포 루트에 커밋되어 있음; `apps/owner-app`, 공유 `packages/*`,
   또는 루트 빌드 파일이 바뀌지 않는 한 이 프로젝트의 빌드를 스킵 —
   [Ignored build step](#ignored-build-step) 참고).
3. 환경 변수: Postgres(`DATABASE_PROVIDER`, `DATABASE_URL`,
   `DATABASE_URL_DIRECT`)와 통합 변수가 이 프로젝트에 존재하는지 확인 —
   `glocalx-mvp-private`가 배포 대상이던 때 원래 구성됐으므로, 빠진 것은
   복사해 오세요.
4. 재루팅 후 `main`을 한 번 재배포하고 `glocalx-mvp-six.vercel.app`이 앱을
   서빙하는지 확인(위 프로덕션-URL 함정 참고 — `glocalx-mvp.vercel.app`은 동결된
   v1 프로젝트).

## 어드민 — 신규 프로젝트 (`glocalx-admin`)

1. Vercel → Add New Project → 같은 GitHub 레포(`jhkim-glocalx/glocalx-mvp`)
   임포트.
2. **Root Directory**: `apps/admin`("Include files outside the root directory"
   활성 유지).
3. **Ignored Build Step** → Custom:
   `bash ../../vercel-ignore-step.sh apps/admin`
   ([Ignored build step](#ignored-build-step) 참고).
4. 환경 변수 (Production + Preview):
   - `DATABASE_PROVIDER=postgres`
   - `DATABASE_URL` — 오너 프로젝트와 같은 풀링 Neon URL
   - `DATABASE_URL_DIRECT` — 같은 다이렉트 Neon URL
   - `APP_INTEGRATION_MODE=stub` (어드민 측 프로덕션 통합이 존재할 때까지, Phase
     3+)
   - Phase 0 task 3이 들어오면 어드민 인증 변수(`apps/admin/.env.example` 참고).
5. 브랜치 매핑은 오너 프로젝트와 같은 GitHub Flow: `main` → 프로덕션, 모든 PR이
   프리뷰 URL을 얻음.

## Ignored build step

`vercel-ignore-step.sh`(레포 루트)는 두 프로젝트가 각자의 **Ignored Build
Step**에서 자신의 앱 디렉터리를 인자로 넘겨 호출하는 공유 게이트입니다. Vercel은
명령을 프로젝트의 Root Directory(`apps/<app>`)에서 실행하므로, 명령이 `../../`로
루트 스크립트에 도달합니다.

스크립트는 넘겨진 앱 디렉터리, 공유 `packages/*`, 또는 루트 빌드
파일(`package.json`, `package-lock.json`, `tsconfig*.json`)이 `HEAD^`와 `HEAD`
사이에 바뀌었을 때 빌드합니다 — 그래서 `packages/*` 변경은 **두** 앱을 리빌드하고,
앱-전용 변경은 그 앱만, 문서-전용 변경은 둘 다 스킵합니다. 첫 배포, `HEAD^` 없는
얕은 클론, 인식 안 되는 앱 디렉터리에서는 안전하게 빌드합니다. Vercel 관례에 따라
빌드하려면 `1`, 스킵하려면 `0`으로 종료합니다.

## 검증 (Phase 0 수용)

- `apps/admin/` 하위만 변경 푸시 → 오너 프로젝트는 "Build skipped" 보고, 어드민
  프로젝트는 빌드. `apps/owner-app/`-전용 변경은 반대. `packages/`-전용 변경은
  **둘 다** 빌드.
- 어드민 프리뷰 URL이 `/api/health`에서 `{"ok":true,"service":"glocalx-admin"}`로
  응답.
- 어드민 로그인 왕복이 스테이징 Neon에 대해 프리뷰에서 작동(task 3 착지 후).

## 마이그레이션 소유권 (불변, 재진술)

`db:pg:migrate`는 스키마 변경당 정확히 한 번, PM/창업자가 `DATABASE_URL_DIRECT`로,
스키마를 담은 PR을 **머지하기 전에** 실행합니다. 어느 앱도 런타임에
마이그레이션하지 않으며; CI가 `db:pg:verify`를 강제합니다. docs/v2/architecture.md
§2 참고.
