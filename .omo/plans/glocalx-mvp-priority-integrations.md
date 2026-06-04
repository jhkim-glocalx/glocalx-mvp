# GlocalX MVP Priority Integrations Plan

## TL;DR
> **Summary**: Build a greenfield, mobile-first chat web app for the core GlocalX MVP: Naver business extraction, Google Business Profile setup orchestration, GBP promotional post publishing, and GBP review synchronization/reply. Ship demo/stub mode first while preserving production adapter boundaries for real Naver/Google credentials.
> **Deliverables**:
> - Next.js TypeScript app with mobile-first chat UI based on the Netlify prototype flow.
> - Naver Local Search extraction plus manual missing-field collection.
> - Google OAuth/GBP account-location setup state machine.
> - GBP post preview/approval/publish flow with stub and production adapters.
> - GBP review sync/reply flow with stub and production adapters.
> - Admin/debug screen, persistence, tests, and browser QA evidence.
> **Effort**: Large
> **Parallel**: YES - 9 dependency-respecting waves
> **Critical Path**: Task 1 -> Task 2 -> Task 4 -> Task 5 -> Task 6 -> Tasks 7/8 -> Tasks 9/11 -> Task 13 -> Task 14 -> Final Verification

## Context

### Original Request
- Read all documents in `01_documents/`.
- Use `https://precious-crumble-e44b18.netlify.app/` as the UI reference.
- Treat `01_documents/크몽/` as outsourced development pipeline estimates.
- Do not build everything; prioritize:
  - Naver-based business information extraction.
  - Automated Google Business Profile creation/setup support.
  - Promotional post upload.
  - Review information synchronization.
- Ask the user immediately for anything they must provide.
- User-facing responses must be Korean; work artifacts and implementation work must be English.

### Interview Summary
- No additional interview was needed before plan generation.
- Default applied: build an executable demo/stub MVP while production credentials are pending.
- Immediate user request: production verification needs Naver Developers Search API credentials, Google Cloud OAuth credentials, GBP API access, and a verified test GBP location/account.

### Metis Review (gaps addressed)
- Clarified "automated GBP setup" as assisted orchestration: discover/link/create/verify/follow-up, not guaranteed instant verified profile launch.
- Clarified review synchronization as import, normalization, persistence, reply generation, and reply publish when a verified location is available.
- Clarified promotional post upload as GBP-first, text-first local posts with optional image pass-through; Instagram is out.
- Added explicit data model, adapter, background job, idempotency, token-security, and QA tasks.
- Split demo/stub completion from credential-gated production verification.
- Constrained Naver Map link handling to URL normalization plus official Local Search lookup unless a future explicit scraping decision is made.

## Work Objectives

### Core Objective
Create a production-shaped MVP skeleton that works end-to-end in stub mode and is ready to switch to real Naver/Google integrations once the user provides credentials and GBP access.

### Deliverables
- App scaffold and quality tooling.
- Domain schema, persistence, and seed fixtures.
- Integration adapter interfaces for Naver and Google GBP.
- Naver official Local Search extraction flow.
- GBP OAuth/account/location setup workflow.
- GBP local post preview, approval, publish, and history.
- GBP review sync, reply suggestion, publish, and history.
- Mobile-first chat UI matching the reference flow's structure and tone.
- Admin/debug panel for integration state, jobs, and audit logs.
- Automated tests and browser QA artifacts.

### Definition of Done (verifiable conditions with commands)
- `npm run typecheck` exits 0.
- `npm run lint` exits 0.
- `npm run test` exits 0.
- `npm run build` exits 0.
- `npm run e2e` exits 0 against `http://127.0.0.1:3000`.
- Browser QA captures screenshots for mobile `390x900` and desktop `1440x1000` into `.omo/evidence/`.
- Stub-mode happy path works without external credentials:
  1. Login as seeded demo owner.
  2. Submit Naver Place URL/store query.
  3. Confirm extracted store profile after filling missing hours.
  4. Connect Google in demo mode.
  5. Reach GBP setup status.
  6. Create/approve/publish a GBP post.
  7. Sync a review and publish a reply.
- Production-mode checks are marked `BLOCKED_BY_CREDENTIALS` unless the required env vars and verified GBP test location are present.

### Must Have
- Source, comments, tests, docs, env names, and commit messages in English.
- Korean user-facing UI copy.
- Demo adapters exercise the same backend routes and database tables as production adapters.
- Production adapters compile and are integration-testable with mocked HTTP even without live credentials.
- All side-effecting actions use idempotency keys and audit logs.
- OAuth tokens are encrypted or stored behind an explicit encrypt/decrypt service abstraction.
- Every external API failure surfaces a Korean, owner-friendly recovery message.

### Must NOT Have
- No Instagram production posting.
- No Xiaohongshu.
- No AI image/video generation, reels, target-country analytics, coupon attribution, weekly report automation, payment, or multi-store team management.
- No direct scraping of Naver pages beyond URL normalization and official API lookup unless user explicitly approves a legal/ToS risk decision later.
- No claim that GBP setup is "complete" until the location is verified.
- No legal advice for malicious reviews; provide platform/reporting guidance only.
- No hardcoded credentials or real tokens in fixtures, logs, screenshots, commits, or error messages.

## Verification Strategy
> ZERO HUMAN INTERVENTION for stub-mode verification. Production verification is conditional on user-provided credentials and verified GBP test location.
- Test decision: TDD with Vitest for units/integration, Playwright for browser e2e, TypeScript strict mode.
- QA policy: Every task has agent-executed scenarios.
- Evidence: `.omo/evidence/task-{N}-{slug}.{ext}`.
- Credential-gated tests must be skipped only by environment detection with an explicit `BLOCKED_BY_CREDENTIALS` report file, never with `.skip`.

## Execution Strategy

### Parallel Execution Waves
Wave 1: Task 1
Wave 2: Tasks 2, 3
Wave 3: Task 4
Wave 4: Task 5
Wave 5: Task 6
Wave 6: Tasks 7, 8
Wave 7: Tasks 9, 10, 11, 12
Wave 8: Task 13
Wave 9: Task 14

### Dependency Matrix (full, all tasks)
- Task 1 blocks all implementation tasks.
- Task 2 blocks Tasks 5, 6, 7, 8, 10, 11, 12.
- Task 3 blocks Tasks 5, 6, 7, 8, 11.
- Task 4 blocks Tasks 5, 6, 7, 8, 9, 10.
- Task 5 blocks Task 6 and Task 9 onboarding completion.
- Task 6 blocks Tasks 7 and 8 production mode.
- Task 7 blocks Task 10 post admin views and Task 13 e2e publish flow.
- Task 8 blocks Task 10 review admin views and Task 13 e2e review flow.
- Task 9 blocks Task 13 browser QA and depends on Tasks 7/8 for connected post/review controls.
- Task 10 blocks Task 13 admin QA.
- Task 11 blocks Task 13 reliability QA and depends on Tasks 7/8 for post/review idempotency coverage.
- Task 12 blocks live integration verification only.
- Task 13 blocks Task 14 and depends on Tasks 5, 6, 7, 8, 9, 10, 11, and 12.
- Task 14 is final polish and documentation after all feature tasks.

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: References + Acceptance Criteria + QA Scenarios.

- [x] 1. Scaffold the Greenfield Web App and Quality Gates

  **What to do**: Create a Next.js App Router project in the workspace root with TypeScript, Tailwind CSS, ESLint, Vitest, Testing Library, Playwright, and npm scripts. Use `src/` or `app/` consistently; choose App Router. Add `.env.example`, `README.md`, and CI-ready scripts. Do not add production integrations yet.
  **Must NOT do**: Do not import credentials, call external APIs, or build feature logic in this task.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: all tasks | Blocked By: none

  **References**:
  - Document: `01_documents/크몽/GBP+매장+관리+웹앱+—+기술+아키텍처.pdf` - outsourced proposal recommends Next.js, TypeScript, Tailwind, Vercel.
  - Document: `01_documents/1. 서비스 개발 기획문서.docx` - project is zero-base web app.
  - UI Reference: `https://precious-crumble-e44b18.netlify.app/` - mobile-first chat prototype.

  **Acceptance Criteria**:
  - [ ] `package.json` includes `dev`, `build`, `lint`, `typecheck`, `test`, `e2e`, and `format:check` scripts.
  - [ ] `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` all exit 0.
  - [ ] Playwright can open the blank app at `http://127.0.0.1:3000`.
  - [ ] `.env.example` contains placeholder names only, no real secrets.

  **QA Scenarios**:
  ```text
  Scenario: App boots locally
    Tool: tmux
    Steps: tmux new-session -d -s ulw-qa-task1 'npm run dev -- --hostname 127.0.0.1 --port 3000'; curl -i http://127.0.0.1:3000
    Expected: HTTP/1.1 200 and body contains "GlocalX" or the initial app shell text.
    Evidence: .omo/evidence/task-1-app-boot.txt

  Scenario: Quality gates pass on scaffold
    Tool: bash
    Steps: npm run typecheck && npm run lint && npm run test && npm run build
    Expected: exit code 0 for every command.
    Evidence: .omo/evidence/task-1-quality-gates.txt
  ```

  **Commit**: YES | Message: `build(app): scaffold glocalx web app` | Files: `package.json`, lockfile, config files, `app/**` or `src/**`, `.env.example`, `README.md`

- [x] 2. Define Domain Schema, Persistence, and Seed Fixtures

  **What to do**: Add persistence for users, stores, extracted business profiles, OAuth connections, GBP accounts/locations, post drafts, post publish attempts, reviews, review replies, jobs, and audit logs. Use SQLite for local/dev and a Postgres-compatible migration path. Add Zod schemas for all route payloads and adapter responses. Seed one demo owner and one demo store fixture.
  **Must NOT do**: Do not store raw tokens in plaintext outside a token encryption abstraction.

  **Parallelization**: Can Parallel: YES with Task 3 | Wave 2 | Blocks: Tasks 4, 5, 6, 7, 8, 10, 11, 12 | Blocked By: Task 1

  **References**:
  - Document: `01_documents/2. 비즈니스 로직 정의서.docx` tables define required data for onboarding, posting, reviews, and analytics.
  - Document: `01_documents/3.기능 정의서.xlsx` FT-03 to FT-19 define input/output/exception contracts.
  - Metis guardrail: explicit state machines and idempotency are required for side-effecting Google workflows.

  **Acceptance Criteria**:
  - [ ] Database schema includes `User`, `Store`, `BusinessProfileExtraction`, `OAuthConnection`, `GbpAccount`, `GbpLocation`, `PostDraft`, `PostPublishAttempt`, `Review`, `ReviewReply`, `JobRun`, and `AuditLog`.
  - [ ] Location statuses include `DISCOVERED`, `CLAIM_REQUIRED`, `CREATE_REQUESTED`, `VERIFICATION_PENDING`, `VERIFIED`, `DUPLICATE`, `FAILED`, and `MANUAL_FOLLOW_UP`.
  - [ ] Tests cover schema validation for malformed route payloads and adapter responses.
  - [ ] Seed command creates deterministic demo data.

  **QA Scenarios**:
  ```text
  Scenario: Seed demo data
    Tool: bash
    Steps: npm run db:reset && npm run db:seed && npm run test -- --run domain-schema
    Expected: demo owner/store exist; tests assert every required table can be written/read.
    Evidence: .omo/evidence/task-2-seed-schema.txt

  Scenario: Reject malformed payload
    Tool: bash
    Steps: npm run test -- --run route-schema-validation
    Expected: invalid payloads return typed validation errors without throwing unhandled exceptions.
    Evidence: .omo/evidence/task-2-validation.txt
  ```

  **Commit**: YES | Message: `feat(data): add glocalx domain schema` | Files: schema/migration files, seed files, domain schema files, tests

- [x] 3. Implement Stub and Production Adapter Boundaries

  **What to do**: Create adapter interfaces and dependency injection for Naver search, Google OAuth, GBP Business Information, GBP Local Posts, GBP Reviews, content generation, translation, and clock/job scheduling. Implement deterministic stub adapters using fixtures. Implement production adapter shells that build authenticated requests but run only when env vars are present.
  **Must NOT do**: Do not make live external calls in unit tests; use HTTP mocking for production adapter tests.

  **Parallelization**: Can Parallel: YES with Task 2 | Wave 2 | Blocks: Tasks 5, 6, 7, 8, 11, 12 | Blocked By: Task 1

  **References**:
  - Naver official docs: `https://developers.naver.com/docs/serviceapi/search/local/local.md`
  - Google location create: `https://developers.google.com/my-business/reference/businessinformation/rest/v1/accounts.locations/create`
  - Google local posts create: `https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts/create`
  - Google reviews list: `https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list`
  - Google review reply: `https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/updateReply`

  **Acceptance Criteria**:
  - [ ] `APP_INTEGRATION_MODE=stub|production` selects adapters from one central module.
  - [ ] Production adapters validate required env vars and return `BLOCKED_BY_CREDENTIALS` when absent.
  - [ ] Adapter tests assert exact HTTP method, URL, headers, scopes, and request body for Google/Naver calls.
  - [ ] Stub adapters persist realistic records through the same services used by production adapters.

  **QA Scenarios**:
  ```text
  Scenario: Stub adapter selected by default
    Tool: bash
    Steps: APP_INTEGRATION_MODE=stub npm run test -- --run adapter-selection
    Expected: services resolve stub adapters and no network call is attempted.
    Evidence: .omo/evidence/task-3-stub-adapters.txt

  Scenario: Production adapter reports missing credentials safely
    Tool: bash
    Steps: APP_INTEGRATION_MODE=production npm run test -- --run missing-credentials
    Expected: result is BLOCKED_BY_CREDENTIALS with redacted env names; no secret values printed.
    Evidence: .omo/evidence/task-3-production-credentials.txt
  ```

  **Commit**: YES | Message: `feat(integrations): add adapter boundaries` | Files: integration adapter files, fixtures, tests

- [x] 4. Build Auth, Demo Session, and Store Context Shell

  **What to do**: Implement a minimal owner session suitable for demo/stub mode plus a Google OAuth callback placeholder for production. Seed login should route first-time demo users into onboarding and returning users into the chat dashboard. Add server-side session helpers and route protection.
  **Must NOT do**: Do not implement Kakao, SMS/PASS identity verification, or multi-store switching.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: Tasks 5, 6, 7, 8, 9, 10 | Blocked By: Tasks 1, 2

  **References**:
  - Document: `01_documents/2. 비즈니스 로직 정의서.docx` section 2.1 leaves login methods undecided.
  - UI Reference: login screen uses Kakao/Google/email buttons but routes to onboarding.
  - Default decision: MVP uses seeded demo owner and production Google OAuth placeholder; Kakao/email are non-functional or hidden.

  **Acceptance Criteria**:
  - [ ] Demo login button creates/loads the seeded demo owner and active store context.
  - [ ] First login routes to onboarding; completed onboarding routes to main chat.
  - [ ] Protected routes redirect unauthenticated users to login.
  - [ ] Tests cover first-login and returning-login routing.

  **QA Scenarios**:
  ```text
  Scenario: First-time demo login routes to onboarding
    Tool: playwright
    Steps: Open http://127.0.0.1:3000, click "Start demo", wait for onboarding prompt.
    Expected: page contains Korean onboarding prompt asking for Naver Place link or store name.
    Evidence: .omo/evidence/task-4-first-login.png

  Scenario: Protected route redirects
    Tool: curl
    Steps: curl -i http://127.0.0.1:3000/app
    Expected: HTTP 302 or 200 login screen, not protected app content.
    Evidence: .omo/evidence/task-4-protected-route.txt
  ```

  **Commit**: YES | Message: `feat(auth): add demo owner session flow` | Files: auth/session files, route files, tests

- [x] 5. Implement Naver Business Information Extraction

  **What to do**: Build onboarding API and service for store-name or Naver Place URL input. Normalize Naver URLs, extract searchable query text, call official Naver Local Search in production mode, and use stub fixtures in demo mode. Map results into internal `BusinessProfileExtraction`. Show ambiguous results for owner selection. Collect missing required fields through the chat flow.
  **Must NOT do**: Do not scrape Naver pages for menu/hours/photos. Treat missing hours/menu/photos as manual collection prompts.

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: Tasks 6, 9 onboarding completion | Blocked By: Tasks 2, 3, 4

  **References**:
  - Document: `01_documents/3.기능 정의서.xlsx` FT-03 and FT-04.
  - Naver official docs: local search endpoint returns `title`, `link`, `category`, `description`, `address`, `roadAddress`, `mapx`, `mapy`; `telephone` is legacy and may be empty.
  - UI Reference: `storeCard()` displays extracted store fields and asks for missing hours.

  **Acceptance Criteria**:
  - [ ] `POST /api/onboarding/extractions` accepts `{ input: string }` and returns normalized candidates.
  - [ ] Stub mode returns deterministic candidates for `https://naver.me/mybrunchcafe` and `브런치모먼트`.
  - [ ] Production mode sends `X-Naver-Client-Id` and `X-Naver-Client-Secret`.
  - [ ] Required fields are `name`, `address`, `category`; `phone` and `hours` are prompted if absent.
  - [ ] Ambiguous matches require explicit selection before profile confirmation.
  - [ ] No-result and timeout paths produce Korean recovery messages and a manual form option.

  **QA Scenarios**:
  ```text
  Scenario: Stub Naver link extraction
    Tool: curl
    Steps: curl -i -X POST http://127.0.0.1:3000/api/onboarding/extractions -H 'Content-Type: application/json' -d '{"input":"https://naver.me/mybrunchcafe"}'
    Expected: HTTP 200; JSON contains candidate name "브런치모먼트 홍대점" and missingFields includes "hours".
    Evidence: .omo/evidence/task-5-naver-stub-link.txt

  Scenario: No Naver result fallback
    Tool: curl
    Steps: curl -i -X POST http://127.0.0.1:3000/api/onboarding/extractions -H 'Content-Type: application/json' -d '{"input":"없는가게zzzz"}'
    Expected: HTTP 200; JSON status is MANUAL_INPUT_REQUIRED and Korean message offers manual entry.
    Evidence: .omo/evidence/task-5-naver-no-result.txt
  ```

  **Commit**: YES | Message: `feat(onboarding): extract business profiles from naver` | Files: onboarding service/routes/UI/tests

- [ ] 6. Implement Google Business Profile Setup Orchestration

  **What to do**: Build Google connection and GBP location setup flow. In stub mode, simulate OAuth success, account discovery, no existing location, create request, and verification pending/verified states. In production mode, implement OAuth callback storage, account/location discovery contract, location creation request construction, ownership/admin-rights URL handling, duplicate handling, and verification status tracking. Surface 7-10 day follow-up reminders as jobs.
  **Must NOT do**: Do not mark a profile as verified without a verified status from Google or explicit stub fixture.

  **Parallelization**: Can Parallel: NO | Wave 5 | Blocks: Tasks 7, 8 production mode | Blocked By: Tasks 2, 3, 4, 5

  **References**:
  - Document: `01_documents/3.기능 정의서.xlsx` FT-05 and FT-06.
  - Google location setup guide: discover -> create -> verify; ownership requests may require leaving the platform and follow-up after 7-10 days.
  - Google location create docs: `POST https://mybusinessbusinessinformation.googleapis.com/v1/{parent=accounts/*}/locations`, scope `business.manage`.
  - UI Reference: OAuth rows show Google linked and GBP newly created.

  **Acceptance Criteria**:
  - [ ] Store GBP setup status uses the explicit state machine from Task 2.
  - [ ] Demo OAuth button creates an `OAuthConnection` and `GbpLocation` record.
  - [ ] Production OAuth callback validates state and stores encrypted tokens.
  - [ ] Existing claimed profiles surface `requestAdminRightsUrl` and a Korean owner-action message.
  - [ ] Verification pending state blocks live posts/review replies and explains why.
  - [ ] Follow-up job is scheduled 7 days after ownership request or verification pending.

  **QA Scenarios**:
  ```text
  Scenario: Stub GBP setup reaches verification pending
    Tool: curl
    Steps: curl -i -X POST http://127.0.0.1:3000/api/gbp/setup -H 'Content-Type: application/json' -d '{"storeId":"demo-store","mode":"stub"}'
    Expected: HTTP 200; JSON status is VERIFICATION_PENDING or VERIFIED according to fixture; audit log created.
    Evidence: .omo/evidence/task-6-gbp-setup-stub.txt

  Scenario: Unverified location blocks live actions
    Tool: bash
    Steps: npm run test -- --run gbp-location-state-machine
    Expected: tests assert posts/replies return LOCATION_NOT_VERIFIED until status is VERIFIED.
    Evidence: .omo/evidence/task-6-unverified-block.txt
  ```

  **Commit**: YES | Message: `feat(gbp): orchestrate location setup` | Files: GBP setup services/routes/UI/tests

- [ ] 7. Implement GBP Promotional Post Preview, Approval, Publish, and History

  **What to do**: Build text-first promotional post flow. Generate deterministic stub content from store profile and owner intent. Format GBP local post with Korean/English copy, location context, optional CTA, and optional media URL pass-through. Render preview card, approval button, edit loop, publish status, retry state, and stored post history. Production adapter must construct the GBP Local Posts create request.
  **Must NOT do**: Do not implement Instagram, scheduling, AI image generation, or video/reels.

  **Parallelization**: Can Parallel: YES with Task 8 | Wave 6 | Blocks: Tasks 10, 13 | Blocked By: Tasks 2, 3, 4, 6

  **References**:
  - Document: `01_documents/3.기능 정의서.xlsx` FT-11, FT-12, FT-13, FT-14, FT-15.
  - Google local posts create docs: `POST https://mybusiness.googleapis.com/v4/{parent=accounts/*/locations/*}/localPosts`, scopes `plus.business.manage` or `business.manage`.
  - UI Reference: `postPreviewCard()` and `publishFlow()` show preview, edit, approval, publish progress, and ID/URL save.

  **Acceptance Criteria**:
  - [ ] `POST /api/posts/drafts` creates a draft from `{ storeId, ownerIntent, targetChannel: "GBP" }`.
  - [ ] Preview displays Korean and English GBP copy and a publish button only when GBP location is eligible.
  - [ ] Owner edit request regenerates the draft without losing original history.
  - [ ] `POST /api/posts/{draftId}/publish` is idempotent and records attempts.
  - [ ] Stub publish returns deterministic `gbpPostId` and URL.
  - [ ] Production adapter tests assert exact local post HTTP request.
  - [ ] Partial/final failure after 3 retries surfaces manual publish guidance.

  **QA Scenarios**:
  ```text
  Scenario: Stub post draft and publish
    Tool: curl
    Steps: curl -i -X POST http://127.0.0.1:3000/api/posts/drafts -H 'Content-Type: application/json' -d '{"storeId":"demo-store","ownerIntent":"주말 브런치 신메뉴 홍보","targetChannel":"GBP"}'; then publish returned draftId.
    Expected: draft response includes formatted GBP copy; publish response includes gbpPostId, publicUrl, and stored history.
    Evidence: .omo/evidence/task-7-post-publish.txt

  Scenario: Publish blocked for unverified location
    Tool: curl
    Steps: Set demo location status to VERIFICATION_PENDING, publish a draft through /api/posts/{draftId}/publish.
    Expected: HTTP 409; JSON code LOCATION_NOT_VERIFIED; Korean message explains Google verification is required.
    Evidence: .omo/evidence/task-7-post-unverified.txt
  ```

  **Commit**: YES | Message: `feat(posts): publish google business profile posts` | Files: post services/routes/UI/tests

- [ ] 8. Implement GBP Review Sync, Reply Suggestions, and Reply Publish

  **What to do**: Build review sync route/job and review UI. In stub mode, import deterministic Google review fixtures. In production mode, implement reviews list request construction and page-token handling. Normalize reviews, detect language/sentiment with deterministic heuristics first, generate three Korean reply options, translate or adapt final reply to review language, and publish through GBP review reply adapter when location is verified.
  **Must NOT do**: Do not give legal advice for malicious reviews; show reporting links/guidance only.

  **Parallelization**: Can Parallel: YES with Task 7 | Wave 6 | Blocks: Tasks 10, 13 | Blocked By: Tasks 2, 3, 4, 6

  **References**:
  - Document: `01_documents/3.기능 정의서.xlsx` FT-16, FT-17, FT-18, FT-19.
  - Google reviews list docs: `GET https://mybusiness.googleapis.com/v4/{parent=accounts/*/locations/*}/reviews`, verified location required.
  - Google review reply docs: `PUT https://mybusiness.googleapis.com/v4/{name=accounts/*/locations/*/reviews/*}/reply`, verified location required.
  - UI Reference: `reviewCard()` and malicious review card show reply choices and warning flow.

  **Acceptance Criteria**:
  - [ ] `POST /api/reviews/sync` imports new reviews idempotently.
  - [ ] Review object stores source channel, raw review id, rating, reviewer, text, detected language, sentiment, created time, and reply status.
  - [ ] Three reply options are generated for non-malicious reviews.
  - [ ] Malicious/spam reviews do not auto-generate normal replies and show safe reporting guidance.
  - [ ] `PUT /api/reviews/{reviewId}/reply` stores selected reply and publishes through adapter when verified.
  - [ ] Production adapter tests assert exact reviews list and updateReply HTTP requests.
  - [ ] Unverified locations block reply publishing with a Korean recovery message.

  **QA Scenarios**:
  ```text
  Scenario: Stub review sync and reply
    Tool: curl
    Steps: curl -i -X POST http://127.0.0.1:3000/api/reviews/sync -H 'Content-Type: application/json' -d '{"storeId":"demo-store"}'; then PUT /api/reviews/{reviewId}/reply with selectedTone "polite".
    Expected: sync imports at least one English review; reply endpoint returns status REPLIED and stored translated/adapted reply.
    Evidence: .omo/evidence/task-8-review-sync-reply.txt

  Scenario: Malicious review safe handling
    Tool: bash
    Steps: npm run test -- --run malicious-review-flow
    Expected: malicious fixture has no normal reply options and returns reporting guidance only.
    Evidence: .omo/evidence/task-8-malicious-review.txt
  ```

  **Commit**: YES | Message: `feat(reviews): sync and reply to gbp reviews` | Files: review services/routes/UI/tests

- [ ] 9. Build Mobile-First Chat UI for Priority Flows

  **What to do**: Implement the user-facing UI in Korean with the reference prototype's structure: login, onboarding prompt, Naver extraction card, missing-field collection, Google OAuth/setup card, post preview/publish card, review sync/reply card, and compact input bar. Use responsive layouts for mobile and desktop. Hide or disable target-country/report/coupon flows from the primary MVP navigation.
  **Must NOT do**: Do not add marketing landing pages, decorative-only sections, or in-app explanatory text about implementation details.

  **Parallelization**: Can Parallel: YES with Tasks 10, 11, 12 | Wave 7 | Blocks: Task 13 browser QA | Blocked By: Tasks 1, 4, 5, 6, 7, 8

  **References**:
  - UI Reference: `https://precious-crumble-e44b18.netlify.app/` screens `login`, `onboard`, `post`, `review`.
  - Prototype inventory: login -> onboard/GBP -> post -> review are priority screens; asset/target/report/dashboard are out or admin/dev-only.
  - Frontend guidance: build the actual usable experience first, mobile text must not overflow, cards only for repeated items/tools.

  **Acceptance Criteria**:
  - [ ] Mobile `390x900` viewport has no horizontal overflow.
  - [ ] Desktop `1440x1000` viewport keeps the chat surface usable and centered.
  - [ ] Buttons and chips are real controls connected to API state.
  - [ ] Loading, empty, error, and retry states exist for Naver extraction, GBP setup, post publish, and review sync.
  - [ ] UI copy is Korean; source/component names remain English.

  **QA Scenarios**:
  ```text
  Scenario: Onboarding chat flow on mobile
    Tool: playwright
    Steps: Set viewport 390x900; login; submit "https://naver.me/mybrunchcafe"; choose candidate; enter hours "09:00 ~ 21:00"; confirm profile.
    Expected: no horizontal overflow; final card shows Google connection/setup action.
    Evidence: .omo/evidence/task-9-onboarding-mobile.png

  Scenario: Desktop chat layout
    Tool: playwright
    Steps: Set viewport 1440x1000; open post screen after seeded onboarding; inspect layout metrics.
    Expected: no overlapping text, no clipped buttons, chat width remains readable.
    Evidence: .omo/evidence/task-9-desktop-layout.png
  ```

  **Commit**: YES | Message: `feat(ui): add mobile chat priority flows` | Files: UI components/routes/styles/tests

- [ ] 10. Add Admin and Debug Operations Surface

  **What to do**: Add a dev/admin-only screen showing integration mode, credential readiness, stores, GBP setup states, post attempts, review sync runs, job runs, and audit logs. Protect it behind a demo/admin session check and `ENABLE_ADMIN_DEBUG=true`.
  **Must NOT do**: Do not expose token values, OAuth refresh tokens, or real secrets.

  **Parallelization**: Can Parallel: YES with Tasks 9, 11, 12 | Wave 7 | Blocks: Task 13 admin QA | Blocked By: Tasks 2, 4, 7, 8

  **References**:
  - Metis guardrail: admin/debug view needs auth/role boundary.
  - Document: `01_documents/2. 비즈니스 로직 정의서.docx` requires storing post IDs/URLs and review histories for tracking.

  **Acceptance Criteria**:
  - [ ] `/admin` is inaccessible unless demo/admin session and env flag are active.
  - [ ] Admin screen shows credential readiness by env var name only.
  - [ ] Admin screen shows post/review/job/audit records.
  - [ ] Tests verify secrets are redacted in UI and logs.

  **QA Scenarios**:
  ```text
  Scenario: Admin disabled by default
    Tool: curl
    Steps: curl -i http://127.0.0.1:3000/admin with ENABLE_ADMIN_DEBUG unset.
    Expected: HTTP 404 or redirect; no admin content.
    Evidence: .omo/evidence/task-10-admin-disabled.txt

  Scenario: Admin shows redacted operational state
    Tool: playwright
    Steps: ENABLE_ADMIN_DEBUG=true; login as demo admin; open /admin.
    Expected: shows integration mode, statuses, and audit logs; no token-looking strings are visible.
    Evidence: .omo/evidence/task-10-admin-redacted.png
  ```

  **Commit**: YES | Message: `feat(admin): add debug operations surface` | Files: admin routes/components/tests

- [ ] 11. Add Jobs, Retries, Idempotency, and Audit Logging

  **What to do**: Implement a lightweight job runner abstraction for local/dev. Add job types for GBP follow-up, post publish retry, and review sync. Add idempotency keys for setup, post publish, and review reply. Record audit logs for every external side effect and every stub side effect.
  **Must NOT do**: Do not require a hosted queue service for local MVP.

  **Parallelization**: Can Parallel: YES with Tasks 9, 10, 12 | Wave 7 | Blocks: Task 13 reliability QA | Blocked By: Tasks 2, 3, 7, 8

  **References**:
  - Document: `01_documents/2. 비즈니스 로직 정의서.docx` posting retry max 3 and review monitor 15-minute cadence.
  - Google location setup guide recommends follow-up 7-10 days after ownership request.
  - Metis guardrail: side-effecting workflows need duplicate-submit protection.

  **Acceptance Criteria**:
  - [ ] Post publish retries at most 3 times with exponential backoff metadata.
  - [ ] Review sync job can run repeatedly without duplicate reviews.
  - [ ] GBP follow-up job is scheduled when ownership/verification is pending.
  - [ ] Idempotency test proves duplicate publish/reply submissions produce one external attempt.
  - [ ] Audit log redacts secret-bearing fields.

  **QA Scenarios**:
  ```text
  Scenario: Duplicate publish is idempotent
    Tool: bash
    Steps: npm run test -- --run post-publish-idempotency
    Expected: two identical publish requests create one external adapter call and two safe responses pointing to same post attempt.
    Evidence: .omo/evidence/task-11-publish-idempotency.txt

  Scenario: Review sync job deduplicates reviews
    Tool: curl
    Steps: curl -i -X POST /api/reviews/sync twice with the same demo store.
    Expected: second response imports 0 new reviews and keeps existing review count stable.
    Evidence: .omo/evidence/task-11-review-sync-idempotency.txt
  ```

  **Commit**: YES | Message: `feat(jobs): add retries and audit logs` | Files: job runner, audit service, tests

- [ ] 12. Add Credential Readiness, Production Runbooks, and Conditional Live Checks

  **What to do**: Define exact env vars, readiness checks, and runbooks for Naver and Google. Add a `npm run integrations:check` command that reports ready/blocked status. Add optional live smoke tests that run only when `RUN_LIVE_INTEGRATION_TESTS=1` and required credentials exist.
  **Must NOT do**: Do not fail normal CI because credentials are absent; fail only if live tests are explicitly requested.

  **Parallelization**: Can Parallel: YES with Tasks 9, 10, 11 | Wave 7 | Blocks: production verification only | Blocked By: Tasks 3, 6, 7, 8

  **References**:
  - Naver docs: app must enable Search API and send Client ID/Secret headers.
  - Google docs: OAuth scope `https://www.googleapis.com/auth/business.manage` is required for core GBP actions.
  - User request: ask immediately for anything the user must provide.

  **Acceptance Criteria**:
  - [ ] `.env.example` includes `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_BUSINESS_ACCOUNT_ID`, `TEST_GBP_LOCATION_ID`, `TOKEN_ENCRYPTION_KEY`, `APP_INTEGRATION_MODE`, `RUN_LIVE_INTEGRATION_TESTS`, and `ENABLE_ADMIN_DEBUG`.
  - [ ] `npm run integrations:check` prints redacted readiness for Naver, Google OAuth, GBP location, local posts, and reviews.
  - [ ] README includes setup steps for Naver Developers and Google Cloud/GBP API access.
  - [ ] Live tests produce `BLOCKED_BY_CREDENTIALS` artifact when prerequisites are absent.

  **QA Scenarios**:
  ```text
  Scenario: Readiness check without credentials
    Tool: bash
    Steps: env -u NAVER_CLIENT_ID -u GOOGLE_CLIENT_ID npm run integrations:check
    Expected: exit code 0; output lists BLOCKED_BY_CREDENTIALS without secret values.
    Evidence: .omo/evidence/task-12-readiness-no-creds.txt

  Scenario: Live tests are opt-in
    Tool: bash
    Steps: RUN_LIVE_INTEGRATION_TESTS=0 npm run test -- --run live-integration-gates
    Expected: normal tests pass and assert live checks are not attempted.
    Evidence: .omo/evidence/task-12-live-opt-in.txt
  ```

  **Commit**: YES | Message: `docs(integrations): add credential readiness runbook` | Files: README, `.env.example`, readiness command, tests

- [ ] 13. Build End-to-End Browser QA for the Priority MVP Surface

  **What to do**: Add Playwright e2e flows that run against the real local app with stub adapters. Cover onboarding, GBP setup, post publish, review sync/reply, error states, and responsive layout. Save screenshots and traces under `.omo/evidence/`.
  **Must NOT do**: Do not rely only on unit tests for user-facing flows.

  **Parallelization**: Can Parallel: NO | Wave 8 | Blocks: Task 14 | Blocked By: Tasks 5, 6, 7, 8, 9, 10, 11, 12

  **References**:
  - UI Reference: priority screens from Netlify prototype.
  - Definition of Done: browser QA must use real surface at `http://127.0.0.1:3000`.

  **Acceptance Criteria**:
  - [ ] `npm run e2e` starts or targets the local dev server and runs Playwright tests.
  - [ ] E2E covers mobile happy path: login -> Naver extraction -> missing field -> GBP setup -> post publish -> review reply.
  - [ ] E2E covers edge path: Naver no result -> manual input; unverified GBP blocks publish/reply.
  - [ ] E2E asserts no horizontal overflow at mobile viewport.
  - [ ] Screenshots are saved into `.omo/evidence/`.

  **QA Scenarios**:
  ```text
  Scenario: Full mobile happy path
    Tool: playwright
    Steps: npm run e2e -- --grep "full mobile happy path"
    Expected: test passes; screenshot shows review reply completed state.
    Evidence: .omo/evidence/task-13-full-mobile-happy-path.png

  Scenario: Edge flow blocks unverified GBP actions
    Tool: playwright
    Steps: npm run e2e -- --grep "unverified location blocks side effects"
    Expected: test passes; UI shows Korean verification-required message for post/reply.
    Evidence: .omo/evidence/task-13-unverified-block.png
  ```

  **Commit**: YES | Message: `test(e2e): cover priority mvp flows` | Files: Playwright config/tests/evidence helpers

- [ ] 14. Final Documentation, Scope Guardrails, and Release Notes

  **What to do**: Update README with product scope, setup, local run, demo mode, production credential checklist, commands, and current exclusions. Add a short `docs/SCOPE.md` documenting included/excluded features and why. Add a release note or changelog entry if the project has one after scaffold.
  **Must NOT do**: Do not imply production Google verification has been completed unless live evidence exists.

  **Parallelization**: Can Parallel: NO | Wave 9 | Blocks: final verification | Blocked By: Tasks 1-13

  **References**:
  - User priority scope.
  - Metis guardrail: scope leak from prototype must be explicitly controlled.
  - Documents: `01_documents/1. 서비스 개발 기획문서.docx`, `01_documents/2. 비즈니스 로직 정의서.docx`, `01_documents/3.기능 정의서.xlsx`.

  **Acceptance Criteria**:
  - [ ] README explains demo/stub versus production modes.
  - [ ] README lists exactly what the user must provide for production Naver/GBP verification.
  - [ ] `docs/SCOPE.md` lists deferred features: Instagram, image/video generation, target-country analytics, coupons, reports, payments, multi-store team management.
  - [ ] Final verification commands are documented.

  **QA Scenarios**:
  ```text
  Scenario: Fresh developer setup docs are executable
    Tool: tmux
    Steps: Start from README commands in a clean shell: npm install; npm run db:reset; npm run db:seed; npm run dev.
    Expected: app boots and seeded demo login works.
    Evidence: .omo/evidence/task-14-readme-setup.txt

  Scenario: Scope docs prevent prototype scope leak
    Tool: bash
    Steps: rg -n "Instagram|target country|coupon|weekly report|payment|multi-store" README.md docs/SCOPE.md
    Expected: every deferred feature appears only in exclusions/deferred sections, not MVP acceptance.
    Evidence: .omo/evidence/task-14-scope-guardrails.txt
  ```

  **Commit**: YES | Message: `docs(scope): document mvp boundaries` | Files: README, docs, changelog if present

## Final Verification Wave (MANDATORY - after ALL implementation tasks)
> ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
- [ ] F1. Plan Compliance Audit
  - Verify every task's acceptance criteria is met or explicitly marked credential-blocked.
  - Command: `npm run typecheck && npm run lint && npm run test && npm run build && npm run e2e`.
  - Evidence: `.omo/evidence/final-plan-compliance.txt`.
- [ ] F2. Code Quality Review
  - Review changed files for token leakage, adapter boundaries, idempotency, state-machine correctness, and Korean user-facing copy.
  - Evidence: `.omo/evidence/final-code-quality.md`.
- [ ] F3. Real Manual QA
  - Browser-use the actual local app at `http://127.0.0.1:3000` on mobile and desktop.
  - Scenario: seeded full happy path from login through review reply.
  - Scenario: no Naver result -> manual input.
  - Scenario: unverified GBP location blocks post/reply.
  - Evidence: `.omo/evidence/final-mobile.png`, `.omo/evidence/final-desktop.png`, `.omo/evidence/final-edge-unverified.png`.
- [ ] F4. Scope Fidelity Check
  - Confirm excluded features are not implemented as production features.
  - Command: `rg -n "instagram|xiaohongshu|coupon|target country|weekly report|payment|subscription" app src docs README.md`.
  - Evidence: `.omo/evidence/final-scope-fidelity.txt`.

## Commit Strategy
- Commit after each task with the exact conventional commit message specified in the task.
- Do not auto-push unless the user explicitly requests it.
- If git is not initialized, ask before `git init`; otherwise leave commits as draft messages in the final report.
- Never commit real `.env` files or generated evidence containing secrets.

## Success Criteria
- Plan deliverable exists at `.omo/plans/glocalx-mvp-priority-integrations.md`.
- Implementation worker can execute the plan without deciding stack, scope, task order, API boundaries, QA scenarios, or credential policy.
- Demo/stub MVP can be completed without external credentials.
- Production integration verification has an explicit user-provided credential checklist:
  - Naver Developers app with Search API enabled.
  - `NAVER_CLIENT_ID`.
  - `NAVER_CLIENT_SECRET`.
  - Google Cloud project with OAuth consent screen and OAuth Web Client.
  - `GOOGLE_CLIENT_ID`.
  - `GOOGLE_CLIENT_SECRET`.
  - `GOOGLE_REDIRECT_URI`.
  - GBP API access approved for the Google Cloud project.
  - Test Google account with access to a safe GBP account/location.
  - `GOOGLE_BUSINESS_ACCOUNT_ID`.
  - `TEST_GBP_LOCATION_ID` for a verified location if live post/review tests are expected.
