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

| 날짜       | 적용된 마이그레이션                                                                                                                                                                                                                                                                                                                                                                                               | 대상                            | 검증 결과                                                                             | 실행자  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------- | ------- |
| 2026-07-18 | `0007_cs_chat_activity` (`0002`–`0006`도 적용됨 — DB에 이전엔 `0001`만 있었음)                                                                                                                                                                                                                                                                                                                                    | production shared Neon Postgres | `Verified Postgres schema with 26 application tables`                                 | founder |
| 2026-07-20 | `0008_cs_ai_mode` (`cs_conversations.mode`를 넓혀 `ai_draft` 추가; `cs_messages.status` + owner-visible partial index 추가; `flagged_at`/`flag_reason` 추가) — 라이브 읽기 경로를 바꾼 PR #12 머지 **전에** Neon에 적용                                                                                                                                                                                           | production shared Neon Postgres | `Verified Postgres schema with 26 application tables` (컬럼/인덱스만, 새 테이블 없음) | founder |
| 2026-07-21 | `0009_campaign_pipeline` (`campaign_requests`, `campaign_assets`, `campaign_review_events`, `publish_jobs` 추가 — 새 테이블 4개) — PR #16 머지 후 적용, Phase 3 PR2에 선행                                                                                                                                                                                                                                        | production shared Neon Postgres | `Verified Postgres schema with 30 application tables`                                 | founder |
| 2026-07-22 | `0010_campaign_final_copy` (nullable `campaign_requests.final_copy` 추가; SQLite는 `ensureColumn`으로 같은 상태 도달, 0010 슬롯 스킵) — Phase 3 PR3 머지 전 Neon에 적용                                                                                                                                                                                                                                           | production shared Neon Postgres | `Verified Postgres schema with 30 application tables` (컬럼만, 새 테이블 없음)        | founder |
| 2026-07-24 | `0011_store_channel_links` (`store_channel_links` 추가 — 매장별 게시 채널 링키지, 새 테이블 1개) — Phase 3 task 6(게시 패널) 머지 전 Neon에 적용                                                                                                                                                                                                                                                                  | production shared Neon Postgres | `Verified Postgres schema with 31 application tables`                                 | founder |
| 2026-07-25 | `0012_org_credentials` (`org_credentials` 추가 — 조직 전역 게시 크레덴셜, 프로바이더별 고유, 새 테이블 1개) — Phase 3 task 7 머지 전 Neon에 적용                                                                                                                                                                                                                                                                  | production shared Neon Postgres | `Verified Postgres schema with 32 application tables`                                 | founder |
| 2026-07-25 | `0013_campaign_nudge` (nullable `campaign_requests.nudged_at` 추가; SQLite는 `ensureColumn`으로 같은 상태 도달, 0013 슬롯 스킵) — Phase 3 task 8 머지 전 Neon에 적용                                                                                                                                                                                                                                              | production shared Neon Postgres | `Verified Postgres schema with 32 application tables` (컬럼만, 새 테이블 없음)        | founder |
| 2026-07-31 | `0014_gbp_access_requests` (`gbp_access_requests` 추가 — 조직 GBP 관리자-접근 추적, 매장당 한 행, 새 테이블 1개) — Phase 4 PR1(데이터 계층) 머지 전 Neon에 적용                                                                                                                                                                                                                                                   | production shared Neon Postgres | `Verified Postgres schema with 33 application tables`                                 | founder |
| 2026-08-05 | `0015_store_gbp_category` (nullable `stores.gbp_primary_category_id` + `stores.gbp_primary_category_display_name` 추가; SQLite는 `ensureColumn`으로 같은 상태 도달, 0015 슬롯 스킵) — PR #30(지오코딩 라이브 GBP 생성) 머지 전 Neon에 적용                                                                                                                                                                        | production shared Neon Postgres | `33 application tables` (컬럼만, 새 테이블 없음)                                      | founder |
| 2026-08-12 | `0016_gbp_verification_state` (`gbp_verification_state` + 매장별 고유 인덱스 추가 — 리스팅별 인증 상태, 새 테이블 1개) — PR #47(인앱 인증 상태 + 조회 시 갱신) 머지 전 Neon에 적용                                                                                                                                                                                                                                | production shared Neon Postgres | `Verified Postgres schema with 34 application tables`                                 | founder |
| 2026-08-13 | `0017_campaign_gbp_cta` (nullable `campaign_requests.gbp_cta_action_type` + `gbp_cta_url` 및 `campaign_requests_gbp_cta_pairing` CHECK 추가; SQLite는 `ensureColumn`으로 컬럼만 도달, 제약 없음, 0017 슬롯 스킵) — PR #52(운영자 CTA 버튼) 머지 전 Neon에 적용                                                                                                                                                    | production shared Neon Postgres | `34 application tables` (컬럼 + 제약만, 새 테이블 없음)                               | founder |
| 2026-08-14 | `0018_publish_job_external_url` (nullable `publish_jobs.external_url` 추가; SQLite는 `ensureColumn`으로 같은 상태 도달, 0018 슬롯 스킵) — PR #56(게시된 글의 url 보존) 머지 전 Neon에 적용                                                                                                                                                                                                                        | production shared Neon Postgres | `34 application tables` (컬럼만, 새 테이블 없음)                                      | founder |
| 2026-08-14 | `0019_store_channel_link_handles` (nullable `store_channel_links.requested_account_handle` + `linked_account_username` 추가; SQLite는 `ensureColumn`으로 같은 상태 도달, 0019 슬롯 스킵) — PR #58(인스타그램 연결 카드) 머지 전 Neon에 적용                                                                                                                                                                       | production shared Neon Postgres | `34 application tables` (컬럼만, 새 테이블 없음)                                      | founder |
| 2026-08-24 | `0020_gbp_access_adoption_review` (`gbp_access_requests_state_check`를 넓혀 `adoption_review` 상태 추가; 컬럼 변경 없음) — PR #60(조직 관리 리스팅 입양) 머지 전 Neon에 적용                                                                                                                                                                                                                                      | production shared Neon Postgres | `34 application tables` (제약만, 새 테이블 없음)                                      | founder |
| 2026-09-04 | `0021_user_deactivation` (nullable `users.deactivated_at` 추가; SQLite는 `ensureColumn`으로 컬럼 도달, 0021 슬롯 스킵) — **2026-08-26 PR #82로 배포됐으나 step‑4 마이그레이트가 누락됨**: `session-store.ts`가 `users`를 조인해 `deactivated_at`로 필터링하기 시작해, 2026‑08‑26부터 프로덕션의 모든 구글/카카오/이메일 회원가입 + 로그인이 없는 컬럼에서 `500` 실패 → 2026‑09‑04에 적용되며 해소 (이슈 #84 참고) | production shared Neon Postgres | `Verified Postgres schema with 34 application tables and 21 applied migrations`       | founder |

> **2026-09-04 백필 노트:** 위 `0015`–`0021` 행은 이 로그가 `0014` 이후
> 방치되어, 2026-09-04에 PR 머지 이력으로부터 재구성한 뒤 같은 날 실행한
> `db:pg:verify` 결과(`34 application tables and 21 applied migrations`)와
> 대조해 채운 것입니다. _무엇이_ 실행됐는지의 원천은 여전히
> `glocalx_schema_migrations` 테이블이며, `0016`/`0018`/`0019`/`0020`의
> 날짜는 PR 머지 날짜이고 정확한 step-4 실행 시각은 따로 기록되지
> 않았습니다. 앞으로 이 표를 최신으로 유지할 것 — 유지됐다면 `0021`
> 누락이 프로덕션에 닿기 전에 잡혔을 것입니다.
