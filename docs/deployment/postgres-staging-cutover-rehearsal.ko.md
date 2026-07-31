# 스테이징 Postgres 컷오버 리허설 런북

> **English:** [postgres-staging-cutover-rehearsal.md](./postgres-staging-cutover-rehearsal.md)

이 런북은 Vercel 프리뷰 또는 스테이징에서의 v2 Postgres 컷오버 리허설 전용입니다.
이 단계들을 실행하는 동안 프로덕션 트래픽을 전환하지 마세요.

비-프로덕션 매니지드 Postgres DB를 사용하세요. 모든 명령 결과를
`.omo/evidence/task-15-v1-to-v2-postgres-architecture.txt`에 기록하고 모든 DB URL,
토큰, 비밀번호, 쿠키, 프로바이더 콘솔 식별자를 편집(redact)하세요.

## 환경 게이트

Vercel 환경 변수는 프로젝트, 팀, 배포 환경으로 스코프됩니다. 변경은 새 배포에만
적용되므로, 리허설 프리뷰 배포를 만들기 전에 변수를 설정하세요.

프리뷰 또는 스테이징 배포 요구사항:

| 변수                         | 필수 프리뷰 값                  | 역할                                                                                                                               |
| ---------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `VERCEL_ENV`                 | `preview`                       | 리허설이 프로덕션이 아님을 확인.                                                                                                   |
| `DATABASE_PROVIDER`          | `postgres`                      | Postgres 런타임 경계를 선택.                                                                                                       |
| `DATABASE_URL`               | `[pooled-preview-postgres-url]` | 앱 런타임, 라우트 핸들러, dev 서버, 빌드, e2e용 풀링 URL.                                                                          |
| 다이렉트 URL 변수            | `[direct-preview-postgres-url]` | 마이그레이션, 스키마 검사, 시드, SQLite 임포트, 어드민에 `DATABASE_URL_DIRECT` 또는 Vercel 관리 Neon `DATABASE_URL_UNPOOLED` 사용. |
| `APP_INTEGRATION_MODE`       | `stub`                          | 외부 통합을 결정적이고 부수효과 없게 유지.                                                                                         |
| `NEXT_PUBLIC_APP_NAME`       | `GlocalX`                       | 기존 공개 앱 플레이스홀더.                                                                                                         |
| `ENABLE_ADMIN_DEBUG`         | `false`                         | 기존 비-시크릿 디버그 플레이스홀더.                                                                                                |
| `RUN_LIVE_INTEGRATION_TESTS` | `0`                             | 리허설 동안 라이브 통합 테스트를 비활성 유지.                                                                                      |

별도 라이브-통합 테스트 계획이 승인되지 않는 한 이 리허설에 프로덕션 OAuth,
네이버, 구글 비즈니스 프로필, OpenAI, 카카오 시크릿을 추가하지 마세요. 필수 앱
변수가 빌드-타임 검증을 위해 플레이스홀더가 필요하면, `.env.example`의
플레이스홀더 값을 쓰고, `APP_INTEGRATION_MODE=stub`을 유지하고, 라이브 부수효과를
부여하지 마세요.

프로덕션 게이트 문구:

- Vercel 프리뷰와 프로덕션 배포는 절대 SQLite나 기본 `/tmp` DB 경로에 의존해선
  안 됨.
- `VERCEL_ENV=production`은 이 리허설로 바뀌면 안 됨.
- 프로덕션은 스테이징 증거가 스키마 마이그레이션, 데모 시드,
  SQLite export/import/reconcile, 앱 런타임, 타깃 테스트, 전체 검증, 중단 동작을
  증명한 후에만 `DATABASE_PROVIDER=postgres`를 쓸 수 있음.
- 프로덕션은 프로바이더 관리 프로덕션 시크릿을 써야 함: 런타임에
  `DATABASE_URL=[pooled-production-postgres-url]`, 마이그레이션, 백업/복원, 장기
  분석, 복제, 어드민 태스크에 하나의 다이렉트 URL 변수.
- 프로덕션 프로모션은 소유자 또는 CTO의 명시적 릴리스 게이트, 검토된 백업/롤백
  계획, 새 프로덕션 배포, 프리뷰 크레덴셜이 프로덕션에서 재사용되지 않는다는 no-go
  체크를 요구함.

비-프로덕션 Postgres URL이 없으면, 어떤 라이브 DB 쓰기 전에 멈추고 기록:

```text
BLOCKED_BY_ENV: no non-production Postgres DATABASE_URL and direct URL variable
were provided; live migration, seed, import, runtime, and e2e steps were not run.
```

## 풀링 vs 다이렉트 URL 규칙

웹/서버리스 앱 트래픽에는 풀링 URL을 사용하세요. 스키마, 임포트, 백업, 복원, 복제,
장기 분석, 어드민 태스크에는 다이렉트 URL을 사용하세요. 프로덕션 유사 앱 시작도
운영 워크플로가 구성 안 된 채 출시될 수 없도록 다이렉트 URL 변수가 존재하는지
검증하지만, 요청 핸들러는 계속 풀링된 `DATABASE_URL`을 사용합니다. 코드는
`DATABASE_URL_DIRECT`, `DATABASE_URL_UNPOOLED`, 그다음 `POSTGRES_URL_NON_POOLING`을
확인합니다.

| 단계 또는 명령                                 | URL 역할       | 비고                                                    |
| ---------------------------------------------- | -------------- | ------------------------------------------------------- |
| `npm run build`                                | pooled         | 빌드-타임 앱 코드가 런타임 Postgres URL을 해석해야 함.  |
| `npm run dev -- --hostname ...`                | pooled         | 로컬 스테이징-유사 앱 런타임이 `DATABASE_URL` 사용.     |
| `npm run e2e:postgres`                         | pooled         | Playwright 앱 서버가 `DATABASE_URL`을 받아야 함.        |
| `npm run db:pg:migrate`                        | direct         | 마이그레이션 툴링을 통해 구성된 다이렉트 URL 변수 사용. |
| `npm run db:pg:seed`                           | direct         | 먼저 마이그레이션, 그다음 결정적 데모 시드 실행.        |
| `npm run db:pg:verify`                         | direct         | 마이그레이션 소스와 영속 테이블 검증.                   |
| `npm run db:migrate:sqlite-to-pg -- --dry-run` | 라이브 DB 아님 | SQLite를 익스포트하고 로컬 익스포트를 조정.             |
| `npm run db:migrate:sqlite-to-pg -- --import`  | direct         | Postgres로 임포트하고 구성된 다이렉트 URL 변수로 조정.  |
| `pg_dump`, `pg_restore`, 프로바이더 어드민     | direct         | 명시적으로 승인되지 않는 한 이 리허설 범위 밖.          |

## 리허설 절차

프리뷰/스테이징 모드에서 깨끗한 브랜치 체크아웃으로 실행하세요.

1. 범위와 브랜치 확인:

   ```bash
   git status --short --branch
   git rev-parse HEAD
   ```

   브랜치가 의도한 피처 브랜치가 아니거나 무관한 더티 파일이 덮어써질 것이면
   중단.

2. Vercel 또는 로컬 셸에서 프리뷰/스테이징 환경 변수 구성. 시크릿 값을 출력하지
   마세요. 로컬 리허설 명령에는 그 프로세스에 필요한 플레이스홀더와 시크릿만
   익스포트:

   ```bash
   export VERCEL_ENV=preview
   export DATABASE_PROVIDER=postgres
   export DATABASE_URL=[pooled-preview-postgres-url]
   export DATABASE_URL_DIRECT=[direct-preview-postgres-url]
   export MIGRATION_EXPORT_ENCRYPTION_KEY=[32-byte-base64-key]
   export APP_INTEGRATION_MODE=stub
   export NEXT_PUBLIC_APP_NAME=GlocalX
   export ENABLE_ADMIN_DEBUG=false
   export RUN_LIVE_INTEGRATION_TESTS=0
   ```

   Vercel 관리 Neon의 경우 `DATABASE_URL_DIRECT` 대신
   `DATABASE_URL_UNPOOLED=[direct-preview-postgres-url]`을 쓸 수 있음.

3. 라이브 URL을 쓰기 전에 통제된 missing-runtime-URL 실패를 증명:

   ```bash
   VERCEL_ENV=preview DATABASE_PROVIDER=postgres APP_INTEGRATION_MODE=stub \
     node --input-type=module -e "import('./src/server/db/config.ts').then(({ resolveDatabaseConfig }) => resolveDatabaseConfig(process.env))"
   ```

   예상 결과: 다음과 함께 0이 아닌 종료:

   ```text
   DATABASE_URL_REQUIRED: DATABASE_URL is required for Postgres runtime mode
   ```

4. 라이브 Postgres DB가 필요 없는 안전한 정적·로컬 체크 실행:

   ```bash
   npm run typecheck
   npm run lint
   npm run test -- src/server/db
   npm run format:check
   ```

5. Postgres를 건드리지 않고 현재 SQLite 데이터를 익스포트·조정:

   ```bash
   npm run db:migrate:sqlite-to-pg -- \
     --dry-run \
     --export .omo/evidence/task-15-sqlite-to-postgres-export.json
   ```

   예상 결과: `Dry-run reconciliation passed`와 `.omo/evidence/` 하위의
   암호화된 소유자-가독 익스포트 파일. 활성 세션은 익스포트되지 않음.

6. 비-프로덕션 Postgres 다이렉트 URL에 대해 스키마 마이그레이션 실행:

   ```bash
   VERCEL_ENV=preview DATABASE_PROVIDER=postgres \
     DATABASE_URL_DIRECT=[direct-preview-postgres-url] \
     npm run db:pg:migrate
   ```

   이 명령이 프로덕션을 대상으로 할 것이거나, 프로바이더 콘솔이 프로덕션
   브랜치/프로젝트/DB를 보이거나, 어떤 마이그레이션 체크섬이 다르면 중단.

7. 다이렉트 URL로 결정적 데모 데이터 시드:

   ```bash
   VERCEL_ENV=preview DATABASE_PROVIDER=postgres \
     DATABASE_URL_DIRECT=[direct-preview-postgres-url] \
     npm run db:pg:seed
   ```

8. SQLite 익스포트를 비-프로덕션 Postgres 대상으로 임포트·조정:

   ```bash
   VERCEL_ENV=preview DATABASE_PROVIDER=postgres \
     DATABASE_URL_DIRECT=[direct-preview-postgres-url] \
     npm run db:migrate:sqlite-to-pg -- \
       --import \
       --input .omo/evidence/task-15-sqlite-to-postgres-export.json \
       --confirm-non-production
   ```

   대상이 폐기 가능한 프리뷰 DB이고 해당 DB에 리셋이 명시적으로 승인된 경우에만
   `--reset-target` 추가. 파괴적 리셋은 또한 크레덴셜이나 쿼리 파라미터 없이
   `DATABASE_URL_DIRECT`와 정확히 일치하는
   `POSTGRES_RESET_TARGET=host[:port]/database`를 요구. 그 리셋은 `VERCEL`과
   `VERCEL_ENV`가 해제된 로컬 어드민 셸에서 실행; 리셋은 배포된 Vercel 환경 안에서
   무조건 차단됨. 임포트는 계정 상태를 복사하기 전에 대상 세션을 무효화함.

9. 다이렉트 URL을 통해 Postgres 스키마 검증:

   ```bash
   VERCEL_ENV=preview DATABASE_PROVIDER=postgres \
     DATABASE_URL_DIRECT=[direct-preview-postgres-url] \
     npm run db:pg:verify
   ```

10. 풀링 URL을 통해 Postgres 런타임 모드로 앱 빌드·실행:

    ```bash
    VERCEL_ENV=preview DATABASE_PROVIDER=postgres \
      DATABASE_URL=[pooled-preview-postgres-url] \
      DATABASE_URL_DIRECT=[direct-preview-postgres-url] \
      APP_INTEGRATION_MODE=stub \
      npm run build

    VERCEL_ENV=preview DATABASE_PROVIDER=postgres \
      DATABASE_URL=[pooled-preview-postgres-url] \
      DATABASE_URL_DIRECT=[direct-preview-postgres-url] \
      APP_INTEGRATION_MODE=stub \
      npm run dev -- --hostname 127.0.0.1 --port 3000
    ```

11. 풀링 런타임 URL에 대해 타깃 및 전체 검증 실행:

    ```bash
    npm run test -- src/server/db

    VERCEL_ENV=preview DATABASE_PROVIDER=postgres \
      DATABASE_URL=[pooled-preview-postgres-url] \
      DATABASE_URL_DIRECT=[direct-preview-postgres-url] \
      APP_INTEGRATION_MODE=stub \
      PLAYWRIGHT_WEB_SERVER_COMMAND="VERCEL_ENV=preview DATABASE_PROVIDER=postgres DATABASE_URL=[pooled-preview-postgres-url] DATABASE_URL_DIRECT=[direct-preview-postgres-url] APP_INTEGRATION_MODE=stub npm run dev -- --hostname 127.0.0.1 --port 3000" \
      npm run e2e:postgres

    npm run typecheck
    npm run lint
    npm run test
    npm run format:check
    ```

    로컬 환경에서 브라우저 검증이 불가능하면, 정확한 실패, 생성된 경우 트레이스
    경로, 수동 검증에 써야 할 프리뷰 배포 URL을 기록.

## 중단 조건

다음 중 하나라도 참이면 리허설을 중단하고 프로덕션을 그대로 유지:

- `VERCEL_ENV`가 `production`이거나, 배포된 프로덕션 컨텍스트에서 미설정이거나,
  프로덕션 배포를 가리킴.
- `DATABASE_URL` 또는 구성된 다이렉트 URL이 프로덕션 DB에 속함.
- 사용 가능한 유일한 DB URL이 프로덕션.
- `DATABASE_URL`이 다이렉트-전용이거나 구성된 다이렉트 URL이 풀링 풀러 URL.
- 마이그레이션 체크섬 검증 실패.
- SQLite export/import 조정이 불일치 보고.
- Postgres 스키마 검증이 누락 테이블이나 마이그레이션 메타데이터 보고.
- 앱 빌드, 타깃 DB 테스트, e2e 런타임 체크가 새로운 Postgres 이유로 실패.
- 시크릿 값이 터미널 출력, 스크린샷, 로그, 문서, 증거에 나타남.

중단은 리허설을 멈추고, 프로덕션 변수를 그대로 두고, 실패 증거를 보존하고, 문제가
고쳐지고 전체 리허설이 재실행될 때까지 기존 비-프로덕션 배포를 계속 사용함을
의미합니다.

## 증거 캡처

`.omo/evidence/task-15-v1-to-v2-postgres-architecture.txt`에 다음을 기록:

- 전후의 브랜치, 커밋, 워크트리 상태.
- Todo 15 계획 파일이 로컬에 있었는지 여부.
- 실행된 정확한 명령과 pass, fail, 또는 `BLOCKED_BY_ENV` 상태.
- 통제된 missing-`DATABASE_URL` 실패 출력.
- SQLite dry-run 익스포트 경로와 조정 요약.
- 라이브 Postgres 마이그레이션, 시드, 임포트, 검증, 빌드, 실행, e2e 결과, 또는
  비-프로덕션 URL이 없을 때의 정확한 `BLOCKED_BY_ENV` 이유.
- 변경된 파일과 최종 커밋 해시.

증거는 간결하게 유지하세요. 시크릿이나 원시 환경 덤프가 아니라 명령 요약을
포함하세요.
