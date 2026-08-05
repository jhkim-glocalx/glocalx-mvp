# Postgres 백업, 복원, 롤백, 관측성 런북

> **English:** [postgres-backup-restore-rollback-observability.md](./postgres-backup-restore-rollback-observability.md)

이 런북은 v2 매니지드 Postgres 롤아웃의 운영 준비 상태를 다룹니다. 스테이징과
프로덕션 계획에 적용되지만, 복원 드릴은 반드시 비-프로덕션 DB에 대해서만
실행해야 합니다. 이 런북에서 프로덕션 트래픽을 전환하거나, 프로덕션 시크릿을
수정하거나, 라이브 부수효과 통합을 실행하지 마세요.

비-프로덕션 복원 드릴이 실행되어 `.omo/evidence/`에 기록되기 전까지 백업은 완전히
준비된 것이 아닙니다. 검증된 복원 없이 구성된 프로바이더 백업 정책은 증명되지 않은
복구 계획입니다.

## URL 역할

스테이징 컷오버 리허설과 같은 연결 분리를 사용하세요:

| 워크플로                                                                                        | URL 역할          | 이유                                                                                                          |
| ----------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| 앱 런타임, 프리뷰/스테이징 스모크 체크, Vercel 서버리스 트래픽                                  | `DATABASE_URL`    | 웹 트래픽용 풀링 런타임 URL.                                                                                  |
| `pg_dump`, `pg_restore`, `psql`, 마이그레이션, 스키마 검증, 장기 분석, 프로바이더 어드민 태스크 | 다이렉트 URL 변수 | `DATABASE_URL_DIRECT`, Vercel 관리 Neon `DATABASE_URL_UNPOOLED`, 또는 레거시 `POSTGRES_URL_NON_POOLING` 사용. |

덤프, 복원, 마이그레이션, 스키마 검증, 복제, 어드민 세션에 풀링된 트랜잭션-풀러
URL을 쓰지 마세요. 정상 애플리케이션 요청 트래픽에 다이렉트 URL을 쓰지 마세요.

프로덕션 유사 배포(`VERCEL=1`, `VERCEL_ENV=preview`, 또는 `VERCEL_ENV=production`)는
시작 시 두 URL 역할을 모두 검증합니다. 다이렉트 URL은 릴리스 및 운영 안전
요구사항이며; 요청 핸들러는 계속 풀링된 `DATABASE_URL`을 사용합니다. 코드는 다이렉트
URL 변수를 이 순서로 확인합니다: `DATABASE_URL_DIRECT`, `DATABASE_URL_UNPOOLED`,
그다음 `POSTGRES_URL_NON_POOLING`.

## 백업 정책

| 환경            | 빈도                                                                                                                            | 소유자                             | 필수 증거                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Staging/preview | 컷오버 테스트가 활성인 동안 최소 매일 프로바이더 관리 백업 또는 브랜치 스냅샷; 파괴적 리허설 전 애드혹 SQL 덤프.                | 컷오버 브랜치의 엔지니어링 소유자. | 현재 스키마 패밀리의 복원 드릴 증거, 덤프 경로 체크섬, 복원된 대상에 대한 `npm run db:pg:verify` 출력.                 |
| Production      | 가능하면 프로바이더 관리 연속 백업/PITR, 플러스 매일 보존 백업; 프로덕션 컷오버 전과 위험한 데이터 마이그레이션 전 애드혹 덤프. | CTO 또는 위임된 프로덕션 운영자.   | 프라이빗 티켓의 프로바이더 백업 정책 스크린샷 또는 익스포트, 비-프로덕션 클론의 복원 드릴 증거, 컷오버 전 소유자 승인. |

보존은 프로바이더 플랜과 비즈니스 복구 목표에 맞춰야 합니다. 공식 복구 목표가
승인되기 전까지, 스테이징은 최소 7개의 매일 복원 지점, 프로덕션-가능 데이터는
최소 14개의 매일 복원 지점을 유지하세요.

## 비-프로덕션 복원 드릴

비-프로덕션 브랜치의 깨끗한 워크트리에서 드릴을 실행하세요. 복원 대상으로 폐기
가능한 매니지드 DB 또는 로컬 Docker Postgres를 사용하세요. 절대 스테이징이나
프로덕션 위에 제자리 복원하지 마세요.

1. 대상이 프로덕션이 아님을 확인:

   ```bash
   git status --short --branch
   git rev-parse HEAD
   test "${VERCEL_ENV:-preview}" != "production"
   ```

2. 시크릿 값을 출력하지 않고 URL 존재 확인:

   ```bash
   node -e "console.log(`DATABASE_URL=${process.env.DATABASE_URL ? 'SET' : 'MISSING'}`); console.log(`direct=${process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING ? 'SET' : 'MISSING'}`)"
   ```

   두 URL이 모두 없고 Docker를 쓸 수 없으면, 중단하고 기록:

   ```text
   BLOCKED_BY_ENV: no non-production DATABASE_URL/direct URL variable and Docker daemon unavailable; backup dump, restore, schema verify, and app runtime checks were not run.
   ```

3. 소스 비-프로덕션 다이렉트 URL에서 커스텀-포맷 덤프 생성:

   ```bash
   pg_dump \
     --format=custom \
     --no-owner \
     --no-acl \
     --file .omo/evidence/task-16-nonprod.dump \
     "$DATABASE_URL_DIRECT"
   shasum -a 256 .omo/evidence/task-16-nonprod.dump
   ```

4. 폐기 가능한 비-프로덕션 대상으로 복원. 소스 DB가 아니라 별도 다이렉트 URL
   사용:

   ```bash
   export RESTORE_DATABASE_URL_DIRECT=[direct-non-production-restore-url]
   pg_restore \
     --clean \
     --if-exists \
     --no-owner \
     --no-acl \
     --dbname "$RESTORE_DATABASE_URL_DIRECT" \
     .omo/evidence/task-16-nonprod.dump
   ```

   플레인 SQL 덤프의 경우 `pg_restore` 대신
   `psql "$RESTORE_DATABASE_URL_DIRECT" --file ...` 사용.

5. 다이렉트 복원 URL을 통해 복원된 스키마 검증:

   ```bash
   VERCEL_ENV=preview \
   DATABASE_PROVIDER=postgres \
   DATABASE_URL_DIRECT="$RESTORE_DATABASE_URL_DIRECT" \
   npm run db:pg:verify
   ```

6. 다이렉트 복원 URL이 아니라 풀링 URL로 앱 런타임 검증:

   ```bash
   VERCEL_ENV=preview \
   DATABASE_PROVIDER=postgres \
   DATABASE_URL=[pooled-non-production-url] \
   DATABASE_URL_DIRECT="$RESTORE_DATABASE_URL_DIRECT" \
   APP_INTEGRATION_MODE=stub \
   npm run test -- src/server/db
   ```

명령 상태, 덤프 체크섬, 복원 대상 설명, 모든 블로커를
`.omo/evidence/task-16-v1-to-v2-postgres-architecture.txt`에 기록하세요. 모든
연결 문자열, 비밀번호, 토큰, 쿠키, 프로바이더 식별자를 편집(redact)하세요.

### 로컬 Docker 폴백

매니지드 비-프로덕션 복원 대상이 없지만 Docker가 실행 중이면, 로컬 compose DB를
폐기 가능한 대상으로 사용:

```bash
docker compose -f docker-compose.postgres.yml up -d postgres
export DATABASE_URL_DIRECT=[local-docker-direct-url-from-docker-compose]
export DATABASE_URL=[local-docker-pooled-or-direct-runtime-url-from-docker-compose]
VERCEL_ENV=preview DATABASE_PROVIDER=postgres npm run db:pg:migrate
VERCEL_ENV=preview DATABASE_PROVIDER=postgres npm run db:pg:seed
pg_dump --format=custom --no-owner --no-acl --file .omo/evidence/task-16-local.dump "$DATABASE_URL_DIRECT"
createdb "[local-docker-restore-direct-url]"
pg_restore --clean --if-exists --no-owner --no-acl --dbname "[local-docker-restore-direct-url]" .omo/evidence/task-16-local.dump
DATABASE_URL_DIRECT=[local-docker-restore-direct-url] VERCEL_ENV=preview DATABASE_PROVIDER=postgres npm run db:pg:verify
DATABASE_URL=[local-docker-pooled-or-direct-runtime-url-from-docker-compose] DATABASE_URL_DIRECT=[local-docker-restore-direct-url] VERCEL_ENV=preview DATABASE_PROVIDER=postgres npm run test -- src/server/db
```

이 폴백은 덤프/복원 메커니즘과 스키마 검증 경로를 증명합니다. 매니지드-프로바이더
PITR, 보존, 네트워킹, Vercel 시크릿 구성은 증명하지 않습니다.

## 롤백 체크리스트

이전 Vercel 배포로의 롤백은 DB 변경이 이전 앱 버전과 하위 호환으로 남아 있는
동안에만 유효합니다.

롤백 전:

- 같은 환경에 대해 마지막으로 알려진 정상(known-good) Vercel 배포를 식별.
- 승인된 프로덕션 인시던트 커맨더가 액션을 소유하지 않는 한, 현재 배포가
  비-프로덕션 크레덴셜을 사용하는지 확인.
- 마지막 정상 배포 이후 파괴적 스키마 마이그레이션이 실행되지 않았는지 확인.
- 이전 앱 버전이 현재 DB 스키마를 읽을 수 있는지 확인.
- 새 nullable 컬럼, 인덱스, 테이블이 expand-only이고 앱 코드를 롤백하기 위해
  데이터 삭제를 요구하지 않는지 확인.
- 트래픽을 바꾸기 전에 현재 로그, 배포 ID, 커밋 해시, DB 마이그레이션 상태 보존.

롤백 액션:

```bash
vercel rollback [deployment-url-or-id]
```

롤백 후 체크:

- 앱 런타임이 풀링된 `DATABASE_URL` 사용.
- 마이그레이션/어드민 명령이 여전히 구성된 다이렉트 URL 변수 사용.
- 오너 로그인, 온보딩 읽기/쓰기, 포스트 드래프트 읽기/쓰기, publish-attempt
  이력이 스텁 모드에서 여전히 작동.
- 애플리케이션 롤백의 일부로 복원이나 스키마 변형을 시도하지 않음.

DB 마이그레이션이 하위 호환이 아니면, 멈추세요. 검토된 호환성 마이그레이션이나
별도 데이터 복구 계획으로 전진(roll forward)하세요. 지름길로 컬럼을 드롭하거나,
테이블을 truncate하거나, 과거 행을 재작성하거나, 프로덕션 위에 복원하지 마세요.

## 마이그레이션 안전

프로덕션 컷오버가 안정될 때까지 expand-only 마이그레이션을 사용하세요:

- 코드가 의존하기 전에 nullable 컬럼 추가.
- 기존 읽기 경로를 제거하지 않고 새 테이블과 인덱스 추가.
- 검증과 함께 별도의 경계 있는 잡에서 백필.
- 전환 동안 옛 형태와 새 형태를 모두 견딜 수 있는 코드 배포.

파괴적 스키마 변경은 백업, 복원 드릴, 소유자 승인, 프로덕션 롤백 분석이 있는
별도 후속 계획을 요구합니다. 예: `DROP TABLE`, `DROP COLUMN`, 비호환 타입 변경,
대량 삭제, 테이블 재작성, 프로덕션이 안정되기 전 SQLite 호환성 제거.

## 관측성 및 보안 체크

스테이징 리허설 동안과 프로덕션 컷오버 후 이 체크를 실행하세요. 연속 모니터링에는
프로바이더 대시보드를, 관리 SQL에는 다이렉트 연결을 선호하세요.

연결 풀 모니터링:

- 풀링 엔드포인트의 프로바이더 연결 수, 풀 포화, 대기 시간, 연결 오류를 지켜보기.
- `DATABASE_POOL_MAX`를 프로바이더 한도 및 Vercel 동시성과 비교.
- `too many connections`, 연결 타임아웃, 풀러 트랜잭션 오류의 스파이크를 조사.

느린 쿼리 리뷰:

- 활성화된 경우 프로바이더 쿼리 인사이트 또는 `pg_stat_statements` 사용.
- 온보딩, 대화, 드래프트, 게시 흐름 후 라우트-인접 느린 쿼리를 리뷰.
- 쿼리 리뷰는 읽기 전용으로 유지. 모니터링 중 애드혹 업데이트를 실행하지 말 것.

감사 로그 리뷰:

```sql
SELECT created_at, action, store_id, actor_user_id, idempotency_key
FROM audit_logs
ORDER BY created_at DESC
LIMIT 50;
```

`audit_logs.redacted_payload_json` 컬럼은 편집된 운영 맥락 전용입니다. 원본
페이로드를 증거, 이슈, 스크린샷, 채팅에 붙여넣지 마세요. 예상치 못한 액션, 반복된
멱등 키, 오너 액션에 대한 누락된 `actor_user_id`, 게시 시도 주변의 감사 갭을
조사하세요.

토큰 및 보안 체크:

- 라이브-통합 계획이 명시적으로 승인되지 않는 한 리허설에는
  `APP_INTEGRATION_MODE=stub` 확인.
- 프로덕션 OAuth, 네이버, 구글 비즈니스 프로필, OpenAI, 카카오, 토큰-암호화
  시크릿이 승인된 환경에만 스코프되는지 확인.
- DB 크레덴셜을 커밋된 파일이 아니라 프로바이더와 Vercel 시크릿 매니저를 통해
  로테이트.
- 커밋 전 변경된 문서와 증거에서 Postgres URL 스킴, OpenAI 키 접두사, OAuth
  클라이언트 시크릿, 쿠키, 원시 JWT 유사 값을 스캔.
- `TOKEN_ENCRYPTION_KEY`를 프로덕션 토큰 저장을 위해 존재시키고 문서, 로그,
  스크린샷, 증거에는 부재시키기.

## No-Go 조건

다음 조건 중 하나라도 참이면 프로모트하거나 백업 준비 완료를 선언하지 마세요:

- 비-프로덕션 복원 드릴이 실행·기록되지 않음.
- 사용 가능한 유일한 DB URL이 프로덕션.
- 프로덕션 유사 배포가 `DATABASE_PROVIDER=postgres`, 풀링된 `DATABASE_URL`, 또는
  구성된 다이렉트 URL 변수 없이 시작될 것.
- 마이그레이션, 백업, 복원, 어드민 작업에 다이렉트 URL 변수가 누락됨.
- 덤프/복원이 풀링 URL 사용.
- 복원된 대상에서 스키마 검증 실패.
- 앱 런타임 검증이 풀링된 `DATABASE_URL` 대신 다이렉트 URL 사용.
- 증거에 편집되지 않은 시크릿이나 프로바이더 식별자 포함.
- 롤백이 파괴적 DB 변경을 요구할 것.

## 참조

- `docs/deployment/postgres-staging-cutover-rehearsal.md`
- `docs/architecture/postgres-environment.md`
- `docs/architecture/v2-postgres-architecture.md`
- PostgreSQL Backup and Restore: https://www.postgresql.org/docs/current/backup.html
- Neon connection pooling: https://neon.com/docs/connect/connection-pooling
