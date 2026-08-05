# 마이그레이션 런북 — 하나의 DB, 두 개의 앱

> **English:** [migration-runbook.md](./migration-runbook.md)

owner-app과 admin이 하나의 Neon Postgres에 대해 독립적으로 배포되므로,
`db:pg:migrate`는 **스키마 변경당 정확히 한 번**, 사람이, 스키마를 담은 PR이
머지되기 전에 실행합니다. 어느 앱도 런타임에 마이그레이션하지 않습니다(SQLite
apply-on-open은 로컬-개발 경로 전용).

## 이름 붙은 단계, 순서대로

1. 마이그레이션을 **두** 방언(dialect)으로 새 순서 SQL 파일로 작성:
   `packages/db/src/migrations/NNNN_name.sql`(SQLite)와
   `packages/db/src/postgres/migrations/NNNN_name.sql`. SQLite 파일을
   `migrationPaths`(`packages/db/src/sqlite.ts`)에 등록하고 새 테이블을
   `operationalTableNames`/`requiredTableNames`에 등록해 `db:pg:verify`가 이를
   강제하도록.
2. **expand-contract** 유지: 가산적 변경(새 테이블, nullable 컬럼)은 자유롭게
   들어감. 이름 변경·삭제·기존 컬럼의 새 제약은 두 앱 모두 옛 형태를 더 이상
   필요로 하지 않는 코드를 돌린 뒤에만 — 한 릴리스 후.
3. CI가 일회용 Postgres에 대해 마이그레이션이 깔끔히 적용됨을 증명
   (`.github/workflows/ci.yml`의 `db:pg:migrate` + `db:pg:verify`).
4. PR을 **머지하기 전에**: PM/창업자가 스테이징/프로덕션 다이렉트 URL이 있는
   셸에서 실행 —

   ```bash
   DATABASE_URL_DIRECT=postgres://... npm run db:pg:migrate
   DATABASE_URL_DIRECT=postgres://... npm run db:pg:verify
   ```

5. 머지. 두 Vercel 프로젝트가 이미-마이그레이션된 스키마에 대해 배포됨; 아직
   재배포되지 않은 앱은 2단계가 옛 형태가 여전히 작동함을 보장했기에 그 창 동안
   계속 서빙.

## 개발용 로컬 Postgres

```bash
docker compose -f docker-compose.postgres.yml up -d
DATABASE_PROVIDER=postgres \
DATABASE_URL=postgres://glocalx:glocalx@127.0.0.1:54329/glocalx \
DATABASE_URL_DIRECT=postgres://glocalx:glocalx@127.0.0.1:54329/glocalx \
npm run db:pg:migrate && npm run db:pg:verify
```

프로덕션 리셋은 `packages/db/src/postgres/reset-guard.ts`의 대상-바인딩 확인
가드에 의해 차단됩니다.

## 적용-마이그레이션 로그

`glocalx_schema_migrations` 테이블(version, checksum, `applied_at`)이 주어진 DB에
무엇이 실행됐는지에 대한 진실의 원천입니다. 이 표는 사람이 읽는 흔적입니다 —
4단계가 실제(비-일회용) DB에 대해 실행될 때마다 행을 추가하세요.

| 날짜       | 적용된 마이그레이션                                                                                                                                                                                                     | 대상                            | 검증 결과                                                                             | 실행자  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------- | ------- |
| 2026-07-18 | `0007_cs_chat_activity` (`0002`–`0006`도 적용됨 — DB에 이전엔 `0001`만 있었음)                                                                                                                                          | production shared Neon Postgres | `Verified Postgres schema with 26 application tables`                                 | founder |
| 2026-07-20 | `0008_cs_ai_mode` (`cs_conversations.mode`를 넓혀 `ai_draft` 추가; `cs_messages.status` + owner-visible partial index 추가; `flagged_at`/`flag_reason` 추가) — 라이브 읽기 경로를 바꾼 PR #12 머지 **전에** Neon에 적용 | production shared Neon Postgres | `Verified Postgres schema with 26 application tables` (컬럼/인덱스만, 새 테이블 없음) | founder |
| 2026-07-21 | `0009_campaign_pipeline` (`campaign_requests`, `campaign_assets`, `campaign_review_events`, `publish_jobs` 추가 — 새 테이블 4개) — PR #16 머지 후 적용, Phase 3 PR2에 선행                                              | production shared Neon Postgres | `Verified Postgres schema with 30 application tables`                                 | founder |
| 2026-07-22 | `0010_campaign_final_copy` (nullable `campaign_requests.final_copy` 추가; SQLite는 `ensureColumn`으로 같은 상태 도달, 0010 슬롯 스킵) — Phase 3 PR3 머지 전 Neon에 적용                                                 | production shared Neon Postgres | `Verified Postgres schema with 30 application tables` (컬럼만, 새 테이블 없음)        | founder |
| 2026-07-24 | `0011_store_channel_links` (`store_channel_links` 추가 — 매장별 게시 채널 링키지, 새 테이블 1개) — Phase 3 task 6(게시 패널) 머지 전 Neon에 적용                                                                        | production shared Neon Postgres | `Verified Postgres schema with 31 application tables`                                 | founder |
| 2026-07-25 | `0012_org_credentials` (`org_credentials` 추가 — 조직 전역 게시 크레덴셜, 프로바이더별 고유, 새 테이블 1개) — Phase 3 task 7 머지 전 Neon에 적용                                                                        | production shared Neon Postgres | `Verified Postgres schema with 32 application tables`                                 | founder |
| 2026-07-25 | `0013_campaign_nudge` (nullable `campaign_requests.nudged_at` 추가; SQLite는 `ensureColumn`으로 같은 상태 도달, 0013 슬롯 스킵) — Phase 3 task 8 머지 전 Neon에 적용                                                    | production shared Neon Postgres | `Verified Postgres schema with 32 application tables` (컬럼만, 새 테이블 없음)        | founder |
| 2026-07-31 | `0014_gbp_access_requests` (`gbp_access_requests` 추가 — 조직 GBP 관리자-접근 추적, 매장당 한 행, 새 테이블 1개) — Phase 4 PR1(데이터 계층) 머지 전 Neon에 적용                                                         | production shared Neon Postgres | `Verified Postgres schema with 33 application tables`                                 | founder |
