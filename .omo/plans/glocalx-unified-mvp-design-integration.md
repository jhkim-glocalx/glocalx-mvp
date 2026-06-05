# GlocalX Unified MVP Design Integration

## TL;DR
> Summary:      Merge the priority MVP integration plan and finalized design integration plan into one executable sequence for the current Next.js App Router workspace. Preserve the existing demo-auth, Naver extraction, GBP setup, and post APIs while porting the finalized design as route-aware components, not as a wholesale Vite SPA transplant.
> Deliverables:
> - Final design tokens and route shell in the Next app.
> - Redesigned `/`, `/onboarding`, and `/app` surfaces wired to existing backend contracts.
> - App read-model APIs for store, GBP, post, review, job, and audit state.
> - Review sync/reply backend and UI to close the remaining priority integration gap.
> - Deterministic target/report/dashboard preview modules with explicit stub-only boundaries.
> - Playwright Chrome QA evidence for mobile, desktop, happy path, and error paths.
> Effort:       Large
> Risk:         Medium - the work touches guarded routes, shared CSS, route handlers, database read models, and prototype-to-product scope boundaries.

## Scope
### Must have
- Keep the current Next.js App Router architecture and server-side route guards in `src/app/onboarding/page.tsx:5` and `src/app/app/page.tsx:5`.
- Keep the demo cookie contract from `src/auth/session.ts:3`, `src/auth/server-session.ts:13`, `src/app/api/auth/demo-login/route.ts:14`, and `src/app/api/onboarding/complete/route.ts:11`.
- Use `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:12` as screen-flow reference and `02_assets/glocalx-mvp-design/client/src/index.css:45` as visual-token reference.
- Keep `02_assets/glocalx-mvp-design/` immutable.
- Keep Korean user-facing copy and English source/test/docs/commit text.
- Keep route handlers thin and service logic in `src/*`, following `src/app/api/onboarding/extractions/route.ts:71` and `src/app/api/gbp/setup/route.ts:34`.
- Use current stub mode as the zero-credential happy path; production-mode checks must return or record `BLOCKED_BY_CREDENTIALS` unless required env vars and verified GBP location are present.
- Add review sync/reply services and route handlers because only review tables and adapters exist today, not product routes.
- Capture every QA artifact under `.omo/evidence/`.

### Metis review resolutions
- Review scope conflict resolved: implement review sync/reply backend routes and UI now because the database tables and adapters already exist while product routes are missing.
- Target/report/dashboard conflict resolved: ship them as deterministic preview modules inside `/app`, not as primary MVP production automation.
- Commit policy conflict resolved: every task lists a draft Conventional Commit message, but executors must not run `git commit` unless the user explicitly authorizes commits.
- QA policy conflict resolved: all verification is agent-executed; final user acknowledgement may be requested for handoff, but it is not a hidden manual QA dependency.
- Design fidelity ambiguity resolved: target token/layout/copy/interaction fidelity in Next-native components, not pixel-perfect Vite SPA parity.
- Production credential ambiguity resolved: stub/demo flow is the default done path; live production checks are opt-in and must report `BLOCKED_BY_CREDENTIALS` when prerequisites are absent.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not copy the Vite `Home.tsx` into one large client component.
- Do not add Wouter, Radix, shadcn, sonner, Recharts, Framer Motion, `next-themes`, `tw-animate-css`, or the prototype UI tree unless a later explicit task proves the dependency is necessary.
- Do not replace server redirects with client-only navigation for protected routes.
- Do not introduce real Kakao/email auth.
- Do not claim Instagram production posting, AI image/video generation, live target-country analytics, coupon attribution, payment, or multi-store team management.
- Do not scrape Naver pages; only normalize URLs and use official Local Search contracts.
- Do not mark GBP setup, post publish, or review reply as live-capable unless `src/gbp/state-machine.ts:14` allows it for a verified location.
- Do not weaken or delete existing tests to fit new visual copy.
- Do not store or display real credentials, raw tokens, or secret values in fixtures, logs, screenshots, or evidence.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD for every behavior change, using Vitest for services/contracts and Playwright with real Chrome via `playwright.config.ts` for browser/API flows.
- QA policy: every task has agent-executed scenarios
- Evidence: `.omo/evidence/task-<N>-<slug>.<ext>`

## Execution strategy
### Parallel execution waves
> Target 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks to maximize parallelism.

Wave 1 (no dependencies):
- Task 1: Preflight reconcile current workspace and baseline tests
- Task 2: Lock design reference map and dependency guardrails
- Task 3: Lock Next 16/API docs and route-handler constraints

Wave 2 (after Wave 1):
- Task 4: depends [1, 2, 3] - port final design tokens and root shell
- Task 5: depends [1, 3] - add app read-model API and repositories
- Task 6: depends [2, 4] - build shared UI primitives and client flow shell
- Task 7: depends [1, 3, 5] - implement review sync/reply backend routes

Wave 3 (after Wave 2):
- Task 8: depends [4, 6] - redesign `/` login landing
- Task 9: depends [4, 5, 6] - wire `/onboarding` extraction and GBP setup UX
- Task 10: depends [4, 5, 6] - build authenticated `/app` workspace shell
- Task 11: depends [5, 6, 10] - wire GBP post draft/publish workspace
- Task 12: depends [6, 7, 10] - wire review management workspace

Wave 4 (after Wave 3):
- Task 13: depends [6, 10, 11, 12] - add deterministic target/report/dashboard modules
- Task 14: depends [5, 7, 10] - add admin/debug and credential-gated production visibility
- Task 15: depends [8, 9, 10, 11, 12, 13, 14] - full regression evidence and docs polish

Critical path: Task 1 -> Task 4 -> Task 6 -> Task 10 -> Task 11 -> Task 13 -> Task 15

### Dependency matrix
| Task | Depends on | Blocks | Can parallelize with |
|------|------------|--------|----------------------|
| 1 | none | 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15 | 2, 3 |
| 2 | none | 4, 6, 8, 9, 10, 11, 12, 13 | 1, 3 |
| 3 | none | 4, 5, 7, 9, 14, 15 | 1, 2 |
| 4 | 1, 2, 3 | 6, 8, 9, 10, 11, 12, 13, 15 | 5, 7 |
| 5 | 1, 3 | 7, 9, 10, 11, 12, 13, 14, 15 | 4, 6 |
| 6 | 2, 4 | 8, 9, 10, 11, 12, 13, 15 | 5, 7 |
| 7 | 1, 3, 5 | 12, 14, 15 | 4, 6 |
| 8 | 4, 6 | 15 | 9, 10 |
| 9 | 4, 5, 6 | 15 | 8, 10 |
| 10 | 4, 5, 6 | 11, 12, 13, 14, 15 | 8, 9 |
| 11 | 5, 6, 10 | 13, 15 | 12 |
| 12 | 6, 7, 10 | 13, 15 | 11 |
| 13 | 6, 10, 11, 12 | 15 | 14 |
| 14 | 5, 7, 10 | 15 | 13 |
| 15 | 8, 9, 10, 11, 12, 13, 14 | final verification | none |

## Todos
> Implementation + Test = ONE task. Never separate.
> Every task MUST have: References + Acceptance Criteria + QA Scenarios + Commit.

- [ ] 1. Preflight Reconcile Current Workspace and Baseline Tests

  What to do: Capture the current dirty state, target file inventory, baseline test status, existing route/API list, and whether any parallel changes alter the two source plans. Read every target file fresh before later edits. Record findings as evidence files only.
  Must NOT do: Do not edit source, revert user changes, stage files, delete files, or normalize unrelated generated artifacts.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `AGENTS.md:1` - repo-specific Next canary warning and doc-reading requirement.
  - Pattern:  `.omo/plans/glocalx-design-integration.md:1` - finalized design integration plan to merge.
  - Pattern:  `.omo/plans/glocalx-mvp-priority-integrations.md:1` - priority integration plan to merge.
  - Pattern:  `package.json:5` - verification scripts and current dependency surface.
  - Pattern:  `playwright.config.ts:1` - real Chrome e2e configuration and dev-server command.
  - Pattern:  `src/app/api/posts/drafts/route.ts:34` - existing post draft API.
  - Pattern:  `src/app/api/posts/[draftId]/publish/route.ts:40` - existing post publish API with async route params.
  - Test:     `tests/e2e/auth-flow.spec.ts:3` - current auth and route-guard expectations.
  - Test:     `tests/e2e/post-publish.spec.ts:11` - current post route expectations.

  Acceptance criteria (agent-executable only):
  - [ ] `git status --short > .omo/evidence/task-1-git-status.txt` captures the exact starting state.
  - [ ] `find src tests .omo/plans -maxdepth 4 -type f | sort > .omo/evidence/task-1-target-files.txt` lists target files.
  - [ ] `npm run typecheck`, `npm run test`, and `npm run e2e` results are captured in `.omo/evidence/task-1-baseline.txt`.
  - [ ] `.omo/evidence/task-1-api-routes.txt` contains the output of `find src/app/api -type f | sort`.

  QA scenarios (MANDATORY - task incomplete without these):
  > Name the exact tool AND its exact invocation - not "verify it works". Browser use: use Chrome to drive the page; if Chrome is not available, download and use agent-browser (https://github.com/vercel-labs/agent-browser). Computer use: OS-level GUI automation for a non-browser desktop app.
  ```
  Scenario: Baseline home route loads
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/app-boot.spec.ts --project=chromium --reporter=line`
    Steps:    Run the command with the existing Playwright webServer; capture the generated browser result and screenshot if the spec is extended.
    Expected: The home route returns 200 and visible GlocalX entry content without console errors.
    Evidence: .omo/evidence/task-1-baseline-home.txt

  Scenario: Baseline protected-route redirect still works
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/auth-flow.spec.ts --project=chromium --reporter=line`
    Steps:    Clear cookies in the spec, visit `/app`, and assert final URL `/`.
    Expected: Unauthenticated `/app` visitors never see protected app content.
    Evidence: .omo/evidence/task-1-baseline-auth.txt
  ```

  Commit: NO | Message: `n/a` | Files: [.omo/evidence/task-1-*]

- [ ] 2. Lock Design Reference Map and Dependency Guardrails

  What to do: Create evidence documenting screen-to-route mapping, design token sources, and forbidden prototype dependencies. Add or update a lightweight test/guard that fails if forbidden design dependencies are introduced into `package.json`.
  Must NOT do: Do not edit finalized design files or import prototype components.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [4, 6, 8, 9, 10, 11, 12, 13] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:12` - prototype screen inventory: login, onboard, asset, post, review, target, report, dashboard.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:30` - single-file stateful prototype that must be decomposed.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:653` - login screen copy and visual intent.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1114` - onboarding chips and missing-hours prompt reference.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1331` - post preview card reference.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1464` - review recommendation card reference.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1554` - target-country preview reference.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1700` - report preview reference.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1811` - board/nav/phone composition reference.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/App.tsx:1` - prototype providers and Wouter routing to avoid.
  - Pattern:  `02_assets/glocalx-mvp-design/package.json:13` - prototype dependency list that must not be copied.
  - Test:     `src/lib/app-shell.test.ts:1` - existing copy contract test pattern.

  Acceptance criteria (agent-executable only):
  - [ ] `.omo/evidence/task-2-design-map.md` maps prototype screens to `/`, `/onboarding`, and `/app` modules.
  - [ ] A dependency guard test exists and fails if `wouter`, `sonner`, `framer-motion`, `recharts`, `next-themes`, `tw-animate-css`, or `@radix-ui/*` appear in root `package.json` without an explicit allowlist.
  - [ ] `npm run test -- --run dependency` exits 0.
  - [ ] `git diff -- 02_assets/glocalx-mvp-design` is empty and captured in `.omo/evidence/task-2-design-immutable.txt`.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Prototype dependency guard passes
    Tool:     bash via `npm run test -- --run dependency`
    Steps:    Run the dependency guard test after implementation.
    Expected: Exit code 0; root app has not imported forbidden prototype dependencies.
    Evidence: .omo/evidence/task-2-dependency-guard.txt

  Scenario: Design asset remains immutable
    Tool:     bash via `git diff -- 02_assets/glocalx-mvp-design > .omo/evidence/task-2-design-immutable.txt`
    Steps:    Run the command after the task.
    Expected: Evidence file is empty.
    Evidence: .omo/evidence/task-2-design-immutable.txt
  ```

  Commit: YES | Message: `test(scope): guard design dependency boundaries` | Files: [src/lib/app-shell.test.ts or new guard test, .omo/evidence/task-2-*]

- [ ] 3. Lock Next 16/API Docs and Route-Handler Constraints

  What to do: Record the local Next 16 constraints that affect implementation and add/update route-handler tests for async `cookies()`, async dynamic route params, root global CSS import, and server/client component boundaries.
  Must NOT do: Do not use training-memory Next APIs when local docs contradict them.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [4, 5, 7, 9, 14, 15] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md:11` - pages/layouts are Server Components by default.
  - Pattern:  `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md:174` - `"use client"` boundary pulls imports into the client bundle.
  - Pattern:  `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md:25` - route handlers belong in `app`.
  - Pattern:  `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md:39` - route and page cannot coexist at same segment.
  - Pattern:  `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md:56` - Tailwind import in global CSS.
  - Pattern:  `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md:6` - `cookies()` is async and set/delete only in route handlers/server functions.
  - Pattern:  `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md:9` - `redirect()` is supported in Server Components and Route Handlers.
  - Pattern:  `src/auth/server-session.ts:13` - current async `cookies()` usage.
  - Pattern:  `src/app/api/posts/[draftId]/publish/route.ts:18` - current async route params pattern.
  - External: `https://developers.naver.com/docs/serviceapi/search/local/local.md` - Naver Local Search official request and response contract.
  - External: `https://developers.google.com/my-business/reference/businessinformation/rest/v1/accounts.locations/create` - GBP Business Information create location contract.
  - External: `https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts/create` - GBP Local Posts create contract.
  - External: `https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list` - GBP Reviews list contract.
  - External: `https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/updateReply` - GBP Review reply contract.

  Acceptance criteria (agent-executable only):
  - [ ] `.omo/evidence/task-3-next-docs.md` lists the exact local Next docs consulted and the constraints applied.
  - [ ] Route handler tests cover invalid JSON and validation errors for every new API added later in this plan.
  - [ ] Existing publish route continues to await `context.params`; `npm run typecheck` exits 0.
  - [ ] Existing root layout keeps `src/app/layout.tsx:21` as `<html lang="ko">`.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Next 16 type constraints pass
    Tool:     bash via `npm run typecheck`
    Steps:    Run the command after route-handler contract checks are added.
    Expected: Exit code 0; no sync cookies or sync route params type regressions.
    Evidence: .omo/evidence/task-3-typecheck.txt

  Scenario: Existing API validation remains strict
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/onboarding-extraction.spec.ts tests/e2e/gbp-setup.spec.ts tests/e2e/post-publish.spec.ts --project=chromium --reporter=line`
    Steps:    Run the current API specs with the existing dev server.
    Expected: All specs pass with JSON validation and current status codes intact.
    Evidence: .omo/evidence/task-3-api-contracts.txt
  ```

  Commit: YES | Message: `test(api): lock next route handler contracts` | Files: [tests or src tests for route contracts, .omo/evidence/task-3-*]

- [ ] 4. Port Final Design Tokens and Root Shell

  What to do: Replace scaffold-light global tokens with the finalized dark canvas/accent system, keep Tailwind import first, preserve `lang="ko"`, update metadata, add responsive no-overflow base styles, and keep token aliases needed by existing pages until all consumers are migrated.
  Must NOT do: Do not paste all prototype CSS or import `tw-animate-css`.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [6, 8, 9, 10, 11, 12, 13, 15] | Blocked by: [1, 2, 3]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/app/globals.css:1` - Tailwind import must remain first.
  - Pattern:  `src/app/globals.css:3` - current root CSS variables to replace/alias.
  - Pattern:  `src/app/layout.tsx:1` - Metadata/Viewport pattern.
  - Pattern:  `src/app/layout.tsx:21` - Korean root HTML language.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/index.css:45` - finalized tokens: `--ink`, `--canvas`, `--accent`, `--mint`, `--blue`, `--phone-bg`, `--card`, `--shadow`, `--r`.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/index.css:72` - body font, dark canvas, overflow-x hidden.
  - Pattern:  `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md:56` - global CSS import guidance.
  - Test:     `src/lib/app-shell.test.ts:1` - simple contract-test style to follow for token assertions.

  Acceptance criteria (agent-executable only):
  - [ ] `src/app/globals.css` keeps `@import "tailwindcss";` as line 1.
  - [ ] `src/app/globals.css` defines `--ink`, `--ink-soft`, `--line`, `--canvas`, `--canvas-2`, `--accent`, `--accent-press`, `--accent-soft`, `--mint`, `--mint-soft`, `--blue`, `--phone-bg`, `--card`, `--shadow`, and `--r`.
  - [ ] Backward-compatible aliases exist for any remaining `--background`, `--foreground`, `--surface`, `--muted`, `--border`, `--primary`, and `--primary-strong` usages until those classes are migrated.
  - [ ] `npm run test -- --run style` and `npm run lint` exit 0.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Desktop shell renders final dark canvas
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/visual-shell.spec.ts --project=chromium --reporter=line`
    Steps:    Open `/` at 1440x1000; assert computed body background is dark and capture screenshot.
    Expected: Screenshot shows finalized dark canvas, orange accent, and no old pale green scaffold.
    Evidence: .omo/evidence/task-4-desktop-shell.png

  Scenario: Mobile shell has no horizontal overflow
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/visual-shell.spec.ts --project=chromium --reporter=line`
    Steps:    Open `/` at 390x900; evaluate `{ innerWidth, scrollWidth: document.documentElement.scrollWidth }`.
    Expected: `scrollWidth <= innerWidth`.
    Evidence: .omo/evidence/task-4-mobile-overflow.json
  ```

  Commit: YES | Message: `feat(ui): port finalized design tokens` | Files: [src/app/globals.css, src/app/layout.tsx, relevant style/visual tests]

- [ ] 5. Add App Read-Model API and Repositories

  What to do: Add typed read-model repository/service and a `GET /api/app/state` route that returns the current demo store, latest extraction, GBP location, post draft/history, review summary, job status, and audit summary. Use Zod parsing for DB rows. Keep it read-only.
  Must NOT do: Do not expose encrypted tokens, raw OAuth values, or secret env values.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [7, 9, 10, 11, 12, 13, 14, 15] | Blocked by: [1, 3]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/server/db/migrations/0001_glocalx_schema.sql:3` - canonical tables.
  - Pattern:  `src/server/db/sqlite.ts:7` - required table names.
  - Pattern:  `src/server/db/sqlite.ts:71` - deterministic demo seed data.
  - Pattern:  `src/server/db/sqlite.ts:191` - seeded review row.
  - Pattern:  `src/posts/post-repository.ts:16` - Zod row parser pattern.
  - Pattern:  `src/posts/post-repository.ts:68` - store read helper pattern.
  - Pattern:  `src/posts/post-repository.ts:118` - publish history read helper pattern.
  - Pattern:  `src/app/api/onboarding/extractions/route.ts:37` - JSON/error route structure to follow.
  - API/Type: `src/domain/schemas.ts:74` - `parseRoutePayload` contract if any query params are validated.
  - Test:     `src/domain/domain-schema.test.ts` - persistence contract test pattern.

  Acceptance criteria (agent-executable only):
  - [ ] New service returns a typed `AppState` object with `store`, `onboarding`, `gbp`, `posts`, `reviews`, `jobs`, and `audit` sections.
  - [ ] `GET /api/app/state` returns 401 or 303-safe JSON for unauthenticated requests and redacted state for authenticated demo users.
  - [ ] State JSON never includes `encrypted_access_token`, `encrypted_refresh_token`, `NAVER_CLIENT_SECRET`, `GOOGLE_CLIENT_SECRET`, or any raw Authorization header.
  - [ ] `npm run test -- --run app-state` and `npm run typecheck` exit 0.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Authenticated app state returns seeded demo data
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/app-state.spec.ts --project=chromium --reporter=line`
    Steps:    Demo-login through `/`, request `/api/app/state`, and assert store name `브런치모먼트 홍대점`, GBP status, post history, and review summary are present.
    Expected: HTTP 200 with redacted, deterministic app state.
    Evidence: .omo/evidence/task-5-app-state.json

  Scenario: App state rejects unauthenticated access
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/app-state.spec.ts --project=chromium --reporter=line`
    Steps:    Clear cookies; request `/api/app/state`.
    Expected: HTTP 401 with Korean recovery message or 303-compatible redirect semantics documented by the test.
    Evidence: .omo/evidence/task-5-app-state-unauth.json
  ```

  Commit: YES | Message: `feat(app): expose redacted workspace state` | Files: [src/app/api/app/state/route.ts, src/app-state or src/app/read-model files, src/domain/schemas.ts if needed, tests/e2e/app-state.spec.ts, relevant unit tests]

- [ ] 6. Build Shared UI Primitives and Client Flow Shell

  What to do: Add focused, typed UI primitives for brand mark, stage layout, step navigation, phone frame/mobile panel, chat rows, chips, status cards, tabs, KPI cards, and action buttons. Put event-driven logic behind small `"use client"` components while keeping route pages server-rendered wrappers.
  Must NOT do: Do not copy `02_assets/glocalx-mvp-design/client/src/components/ui/**`; do not make `src/app/layout.tsx` or whole routes client components.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [8, 9, 10, 11, 12, 13, 15] | Blocked by: [2, 4]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/index.css:85` - board/stage layout primitives.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/index.css:187` - horizontal mobile step navigation pattern.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1811` - board/nav/phone composition.
  - Pattern:  `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md:19` - client components only for state/event handlers.
  - Pattern:  `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md:182` - reduce JS by keeping boundaries narrow.
  - API/Type: `src/app/layout.tsx:15` - simple typed props style.
  - Test:     `src/lib/app-shell.test.ts:1` - compact unit test style.

  Acceptance criteria (agent-executable only):
  - [ ] Shared UI files exist under `src/components/glocalx/` or route-local `src/app/**/_components/` and each file stays under 250 pure LOC.
  - [ ] Only files that need state/event handlers contain `"use client"`.
  - [ ] UI primitives render stable dimensions for nav buttons, phone frame, cards, and tabs at 390px and 1440px widths.
  - [ ] `npm run test -- --run ui` and `npm run lint` exit 0.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: UI primitives render without layout shift
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/ui-primitives.spec.ts --project=chromium --reporter=line`
    Steps:    Render a route or test page using every primitive at 390x900 and 1440x1000; capture layout metrics before and after hover/focus.
    Expected: No element grows horizontally beyond viewport; button/card text remains inside its container.
    Evidence: .omo/evidence/task-6-ui-primitives.png

  Scenario: Server/client boundary remains narrow
    Tool:     bash via `rg -n '"use client"' src/app src/components > .omo/evidence/task-6-client-boundaries.txt`
    Steps:    Inspect the boundary list and compare it with the primitive files that need event handlers.
    Expected: Route pages and root layout are not marked client-only; only interactive components are client components.
    Evidence: .omo/evidence/task-6-client-boundaries.txt
  ```

  Commit: YES | Message: `feat(ui): add glocalx workspace primitives` | Files: [src/components/glocalx/** or route-local components, component tests, tests/e2e/ui-primitives.spec.ts]

- [ ] 7. Implement Review Sync and Reply Backend Routes

  What to do: Add review service/repository/routes for sync, reply suggestion selection, and reply publish. Use existing review tables, GBP review adapters, translation/content stubs, idempotency/audit patterns, and location verification gating.
  Must NOT do: Do not publish replies when `canUseLiveGbpActions()` blocks the current GBP location. Do not give legal advice for malicious reviews; surface platform/reporting guidance only.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [12, 14, 15] | Blocked by: [1, 3, 5]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/server/db/migrations/0001_glocalx_schema.sql:99` - `reviews` table.
  - Pattern:  `src/server/db/migrations/0001_glocalx_schema.sql:114` - `review_replies` table.
  - Pattern:  `src/server/db/sqlite.ts:191` - seeded demo review.
  - Pattern:  `src/server/db/sqlite.ts:209` - seeded draft reply.
  - Pattern:  `src/integrations/contracts.ts:84` - `GbpReviewsAdapter` interface.
  - Pattern:  `src/integrations/stub.ts:126` - stub list/updateReply specs.
  - Pattern:  `src/integrations/production.ts:142` - production review request specs.
  - Pattern:  `src/gbp/state-machine.ts:14` - verified-location gate shared by posts and review replies.
  - Pattern:  `src/posts/post-flow.ts:116` - idempotent publish flow and blocked result shape.
  - Pattern:  `src/app/api/posts/drafts/route.ts:34` - route JSON parsing/validation pattern.
  - External: `https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list` - official list endpoint and verified-location requirement.
  - External: `https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/updateReply` - official reply endpoint and verified-location requirement.

  Acceptance criteria (agent-executable only):
  - [ ] `POST /api/reviews/sync` imports or refreshes deterministic stub reviews and writes audit/job state.
  - [ ] `POST /api/reviews/[reviewId]/reply` accepts `{ storeId, selectedTone, idempotencyKey? }`, creates/updates a draft reply, and publishes only when location is verified.
  - [ ] Malicious/spam review status returns `BLOCKED` with Korean reporting guidance and no auto-generated reply.
  - [ ] Production mode without Google credentials returns `BLOCKED_BY_CREDENTIALS` without secret values.
  - [ ] `npm run test -- --run review` and `npm run typecheck` exit 0.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Stub review sync and reply draft succeeds
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/review-management.spec.ts --project=chromium --reporter=line`
    Steps:    Demo-login, POST `/api/reviews/sync`, POST `/api/reviews/demo-review/reply` with `{ "storeId":"demo-store", "selectedTone":"polite", "idempotencyKey":"qa-review-reply" }`.
    Expected: Sync returns a review count; reply returns `REPLIED` or deterministic draft/published status with redacted audit evidence.
    Evidence: .omo/evidence/task-7-review-sync-reply.json

  Scenario: Review reply blocked for unverified GBP location
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/review-management.spec.ts --project=chromium --reporter=line`
    Steps:    Reset DB, call `/api/gbp/setup` in stub mode to create `VERIFICATION_PENDING`, then attempt `/api/reviews/demo-review/reply`.
    Expected: HTTP 409 with code `LOCATION_NOT_VERIFIED` and the Korean message from `src/gbp/state-machine.ts:25`.
    Evidence: .omo/evidence/task-7-review-unverified.json
  ```

  Commit: YES | Message: `feat(reviews): add gbp sync and reply routes` | Files: [src/reviews/**, src/app/api/reviews/**, src/domain/schemas.ts, src/integrations/stub.ts if fixtures need expansion, unit tests, tests/e2e/review-management.spec.ts]

- [ ] 8. Redesign `/` Login Landing

  What to do: Replace scaffold landing visuals with the finalized brand/login composition while preserving the real demo-login form. The primary action must submit to `/api/auth/demo-login`. Any Kakao/email/Google-looking alternatives must be disabled/coming-soon or removed.
  Must NOT do: Do not add real Kakao/email auth; do not use prototype `toast.success`; do not route to onboarding through local React state.

  Parallelization: Can parallel: YES | Wave 3 | Blocks: [15] | Blocked by: [4, 6]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/app/page.tsx:11` - current server landing route.
  - Pattern:  `src/app/page.tsx:55` - current form action/method to preserve.
  - Pattern:  `src/lib/app-shell.ts:9` - current shared copy.
  - Pattern:  `src/app/api/auth/demo-login/route.ts:14` - real auth action target and redirect behavior.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:653` - final login visual/copy reference.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:667` - prototype auth alternatives that must not be shipped as real providers.
  - Test:     `tests/e2e/auth-flow.spec.ts:3` - first-login and returning-login behavior.
  - Test:     `tests/e2e/app-boot.spec.ts:1` - route boot smoke.

  Acceptance criteria (agent-executable only):
  - [ ] `/` displays the final brand mark, headline, supporting copy, and one real primary demo-login CTA.
  - [ ] The CTA submits a POST to `/api/auth/demo-login` and redirects first-time users to `/onboarding`.
  - [ ] Returning demo users still route to `/app`.
  - [ ] Disabled auth alternatives, if rendered, are inaccessible as successful auth paths and do not set demo cookies.
  - [ ] `npx playwright test tests/e2e/auth-flow.spec.ts tests/e2e/app-boot.spec.ts --project=chromium --reporter=line` exits 0.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: First-time demo login starts onboarding
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/auth-flow.spec.ts --project=chromium --reporter=line`
    Steps:    Clear cookies, open `/`, click the primary demo-login button, wait for `/onboarding`.
    Expected: URL matches `/onboarding`; onboarding prompt is visible.
    Evidence: .omo/evidence/task-8-demo-login.txt

  Scenario: Placeholder auth alternatives do not fake success
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/auth-flow.spec.ts --project=chromium --reporter=line`
    Steps:    Open `/`, attempt to interact with any disabled Kakao/email/Google visual option.
    Expected: User remains on `/`; no `glocalx_demo_session` cookie is set by that option.
    Evidence: .omo/evidence/task-8-auth-placeholder.txt
  ```

  Commit: YES | Message: `feat(ui): redesign demo login landing` | Files: [src/app/page.tsx, src/lib/app-shell.ts or copy module, tests/e2e/auth-flow.spec.ts, tests/e2e/app-boot.spec.ts, visual evidence]

- [ ] 9. Wire `/onboarding` Extraction and GBP Setup UX

  What to do: Replace the one-shot onboarding completion form with a design-inspired chat/step flow that calls `/api/onboarding/extractions`, shows candidate/missing-hours/manual fallback states, calls `/api/gbp/setup`, displays verification/claim-required status, then completes onboarding through `/api/onboarding/complete`.
  Must NOT do: Do not complete onboarding before a candidate or manual fallback path is visible. Do not claim Google verification is complete unless the API result is `VERIFIED`.

  Parallelization: Can parallel: YES | Wave 3 | Blocks: [15] | Blocked by: [4, 5, 6]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/app/onboarding/page.tsx:5` - preserve server guard and redirects.
  - Pattern:  `src/app/onboarding/page.tsx:29` - current completion form to replace carefully.
  - Pattern:  `src/app/api/onboarding/extractions/route.ts:71` - extraction API to call.
  - Pattern:  `src/onboarding/extraction.ts:81` - input normalization.
  - Pattern:  `src/onboarding/extraction.ts:206` - candidate result handling.
  - Pattern:  `src/onboarding/extraction.ts:207` - no-result manual fallback.
  - Pattern:  `src/app/api/gbp/setup/route.ts:34` - GBP setup API to call.
  - Pattern:  `src/gbp/setup.ts:216` - setup orchestration and result statuses.
  - Pattern:  `src/app/api/onboarding/complete/route.ts:11` - final completion action.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1114` - onboarding initial chips.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1125` - missing-hours prompt.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1250` - OAuth card reference.
  - Test:     `tests/e2e/onboarding-extraction.spec.ts:3` - current extraction API expectations.
  - Test:     `tests/e2e/gbp-setup.spec.ts:3` - current GBP setup API expectations.

  Acceptance criteria (agent-executable only):
  - [ ] `/onboarding` still redirects unauthenticated users to `/` and completed users to `/app`.
  - [ ] Submitting `https://naver.me/mybrunchcafe` displays `브런치모먼트 홍대점` and prompts for missing `hours`.
  - [ ] No-result input displays the Korean manual-entry fallback from `src/onboarding/extraction.ts:210`.
  - [ ] GBP setup result displays `VERIFICATION_PENDING`, `CLAIM_REQUIRED`, or `BLOCKED_BY_CREDENTIALS` with Korean recovery copy.
  - [ ] Completion redirects to `/app` only through `/api/onboarding/complete`.
  - [ ] `npx playwright test tests/e2e/onboarding-flow.spec.ts --project=chromium --reporter=line` exits 0.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Stub onboarding completes through extraction and GBP setup
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/onboarding-flow.spec.ts --project=chromium --reporter=line`
    Steps:    Demo-login, enter `https://naver.me/mybrunchcafe`, choose/fill `매일 오전 10시부터 밤 9시까지 열어요!`, click Google/GBP setup, click complete.
    Expected: Candidate, missing-hours, verification-pending status, and final `/app` redirect all occur in order.
    Evidence: .omo/evidence/task-9-onboarding-happy.png

  Scenario: Naver no-result path offers manual entry
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/onboarding-flow.spec.ts --project=chromium --reporter=line`
    Steps:    Demo-login, enter `없는가게zzzz`, submit extraction.
    Expected: Manual-entry Korean message and required fields are visible; no unhandled error appears.
    Evidence: .omo/evidence/task-9-onboarding-no-result.png
  ```

  Commit: YES | Message: `feat(onboarding): wire extraction and gbp setup flow` | Files: [src/app/onboarding/page.tsx, onboarding client components, tests/e2e/onboarding-flow.spec.ts, related unit tests]

- [ ] 10. Build Authenticated `/app` Workspace Shell

  What to do: Replace the placeholder dashboard with a server-guarded workspace shell that fetches app state and renders design-inspired step navigation, mobile-first stage, and modules for setup, post, review, target, report, and dashboard. Store purely UI tab/step state in a focused client component.
  Must NOT do: Do not bypass `getDemoSession()` or make `/app` visible before onboarding is complete.

  Parallelization: Can parallel: YES | Wave 3 | Blocks: [11, 12, 13, 14, 15] | Blocked by: [4, 5, 6]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/app/app/page.tsx:5` - preserve server guard.
  - Pattern:  `src/app/app/page.tsx:16` - placeholder shell to replace.
  - Pattern:  `src/auth/server-session.ts:13` - session source.
  - Pattern:  `src/app/api/app/state/route.ts` - read model from Task 5.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1811` - board composition.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1841` - step navigation reference.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1859` - phone frame reference.
  - Test:     `tests/e2e/auth-flow.spec.ts:15` - returning-login route behavior.

  Acceptance criteria (agent-executable only):
  - [ ] `/app` renders store name, GBP status, latest post/review summaries, and step navigation from real app state.
  - [ ] `/app` redirects unauthenticated users to `/` and incomplete users to `/onboarding`.
  - [ ] Step navigation works by buttons/tabs without URL-breaking client-only auth assumptions.
  - [ ] Mobile 390x900 layout shows no horizontal overflow and no overlapping text.
  - [ ] `npx playwright test tests/e2e/app-workspace.spec.ts --project=chromium --reporter=line` exits 0.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Authenticated workspace renders real state
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/app-workspace.spec.ts --project=chromium --reporter=line`
    Steps:    Complete demo login/onboarding, land on `/app`, assert `브런치모먼트 홍대점`, GBP status, post module tab, and review module tab are visible.
    Expected: Workspace content is visible and derived from app state.
    Evidence: .omo/evidence/task-10-app-workspace.png

  Scenario: Incomplete onboarding cannot view workspace
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/app-workspace.spec.ts --project=chromium --reporter=line`
    Steps:    Clear cookies, demo-login, visit `/app` before completing onboarding.
    Expected: URL redirects to `/onboarding`.
    Evidence: .omo/evidence/task-10-app-guard.txt
  ```

  Commit: YES | Message: `feat(app): add guarded workspace shell` | Files: [src/app/app/page.tsx, workspace components, tests/e2e/app-workspace.spec.ts]

- [ ] 11. Wire GBP Post Draft and Publish Workspace

  What to do: Add the post module UI inside `/app` that creates a GBP draft from owner intent, previews Korean/English copy, supports revision, publishes through existing route handlers, and displays publish history or verified-location blocking messages.
  Must NOT do: Do not render Instagram as a live channel. It may appear only as disabled/out-of-scope copy if needed.

  Parallelization: Can parallel: YES | Wave 3 | Blocks: [13, 15] | Blocked by: [5, 6, 10]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/app/api/posts/drafts/route.ts:34` - create draft route.
  - Pattern:  `src/app/api/posts/[draftId]/publish/route.ts:40` - publish route.
  - Pattern:  `src/posts/post-flow.ts:67` - draft creation.
  - Pattern:  `src/posts/post-flow.ts:116` - publish flow.
  - Pattern:  `src/posts/post-flow.ts:121` - unverified-location blocking result.
  - Pattern:  `src/posts/post-types.ts:41` - post preview type.
  - Pattern:  `src/posts/post-types.ts:61` - publish result union.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1331` - post preview card reference.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1421` - publishing status card reference.
  - External: `https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts/create` - official local post endpoint and scope.
  - Test:     `tests/e2e/post-publish.spec.ts:11` - current API-level post happy path.
  - Test:     `src/posts/post-flow.test.ts:36` - service-level draft test.

  Acceptance criteria (agent-executable only):
  - [ ] Typing `주말 브런치 신메뉴 홍보` in the post module calls `/api/posts/drafts` and shows returned Korean/English preview.
  - [ ] Publish calls `/api/posts/{draftId}/publish` with a stable idempotency key and shows publish history on success.
  - [ ] Unverified GBP location displays the exact `LOCATION_NOT_VERIFIED` Korean message and keeps the draft available.
  - [ ] `npx playwright test tests/e2e/post-workspace.spec.ts tests/e2e/post-publish.spec.ts --project=chromium --reporter=line` exits 0.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Create and publish GBP draft from workspace
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/post-workspace.spec.ts --project=chromium --reporter=line`
    Steps:    Complete demo flow, open `/app`, switch to post module, enter `주말 브런치 신메뉴 홍보`, create draft, publish.
    Expected: Preview includes `브런치모먼트 홍대점에서 주말 브런치 신메뉴 홍보`; publish history shows `SUCCEEDED`.
    Evidence: .omo/evidence/task-11-post-publish.png

  Scenario: Publish blocked when GBP location is pending
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/post-workspace.spec.ts --project=chromium --reporter=line`
    Steps:    Reset DB, force/setup pending GBP status through `/api/gbp/setup`, create draft, attempt publish.
    Expected: UI shows `Google 비즈니스 프로필 인증이 완료되어야 게시글과 리뷰 답글을 라이브로 진행할 수 있습니다.`
    Evidence: .omo/evidence/task-11-post-blocked.png
  ```

  Commit: YES | Message: `feat(posts): wire gbp draft publish workspace` | Files: [post workspace components, tests/e2e/post-workspace.spec.ts, existing post tests if updated]

- [ ] 12. Wire Review Management Workspace

  What to do: Add the review module UI inside `/app` that syncs reviews, shows language/sentiment, offers three tone choices, calls review reply route, and displays malicious/spam guidance without auto-reply.
  Must NOT do: Do not display legal certainty or advice; do not auto-publish malicious review replies.

  Parallelization: Can parallel: YES | Wave 3 | Blocks: [13, 15] | Blocked by: [6, 7, 10]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/app/api/reviews/sync/route.ts` - review sync API from Task 7.
  - Pattern:  `src/app/api/reviews/[reviewId]/reply/route.ts` - review reply API from Task 7.
  - Pattern:  `src/server/db/sqlite.ts:191` - seeded review copy.
  - Pattern:  `src/server/db/sqlite.ts:209` - seeded reply draft.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1464` - review recommendation card.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1487` - tone selection options.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1532` - malicious review alert.
  - External: `https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list` - official list endpoint.
  - External: `https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/updateReply` - official reply endpoint.
  - Test:     `tests/e2e/review-management.spec.ts` - backend spec from Task 7 to extend with UI coverage.

  Acceptance criteria (agent-executable only):
  - [ ] Review module can trigger sync and render the latest review from app state or sync response.
  - [ ] Tone selection calls reply API and updates the selected review status.
  - [ ] Malicious/spam path shows reporting guidance and no reply publish CTA.
  - [ ] Unverified-location block is shown with the same message as post publish.
  - [ ] `npx playwright test tests/e2e/review-workspace.spec.ts tests/e2e/review-management.spec.ts --project=chromium --reporter=line` exits 0.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Select polite review reply tone
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/review-workspace.spec.ts --project=chromium --reporter=line`
    Steps:    Open `/app`, switch to review module, sync reviews, select `정중하게`.
    Expected: Reply status updates; Korean reply text is visible; audit/result status is recorded.
    Evidence: .omo/evidence/task-12-review-reply.png

  Scenario: Malicious review guidance avoids auto-reply
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/review-workspace.spec.ts --project=chromium --reporter=line`
    Steps:    Seed or trigger a malicious review fixture, open review module.
    Expected: Reporting guidance is visible; no publish-reply button is enabled for that review.
    Evidence: .omo/evidence/task-12-review-malicious.png
  ```

  Commit: YES | Message: `feat(reviews): add review management workspace` | Files: [review workspace components, tests/e2e/review-workspace.spec.ts, relevant review tests]

- [ ] 13. Add Deterministic Target, Report, and Dashboard Modules

  What to do: Add target-country recommendation, weekly report, and dashboard modules using deterministic fixture/read-model data. Make the UI useful for demo scanning while labeling analytics and coupon data as preview/stub-only. Use CSS/semantic markup rather than chart libraries.
  Must NOT do: Do not claim live analytics, coupon attribution, scheduler automation, or country targeting intelligence is production-backed.

  Parallelization: Can parallel: YES | Wave 4 | Blocks: [15] | Blocked by: [6, 10, 11, 12]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:712` - dashboard period state reference.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1554` - target country card reference.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1657` - coupon card that must be preview-only.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1700` - weekly report card reference.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1770` - report question chips reference.
  - Pattern:  `src/server/db/sqlite.ts:160` - seeded post data.
  - Pattern:  `src/server/db/sqlite.ts:191` - seeded review data.
  - Pattern:  `src/app/api/app/state/route.ts` - read-model source from Task 5.
  - Test:     `tests/e2e/app-workspace.spec.ts` - route workspace spec to extend.

  Acceptance criteria (agent-executable only):
  - [ ] Target module shows deterministic Korea/Japan/Taiwan/US recommendation data with clear preview/stub copy.
  - [ ] Report module shows deterministic weekly metrics and answers at least two report chips without backend errors.
  - [ ] Dashboard module supports weekly/monthly/all-time segmented controls and stable KPI cards without Recharts.
  - [ ] Mobile/desktop screenshots show no overlapping labels or text overflow.
  - [ ] `npx playwright test tests/e2e/report-dashboard.spec.ts --project=chromium --reporter=line` exits 0.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Target and report preview flow works
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/report-dashboard.spec.ts --project=chromium --reporter=line`
    Steps:    Open `/app`, switch to target module, choose Japan, open report module, click `어떤 게시물이 제일 잘됐어?`.
    Expected: Recommendation, report metrics, and answer card are visible with preview/stub labeling.
    Evidence: .omo/evidence/task-13-target-report.png

  Scenario: Dashboard period controls do not overflow
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/report-dashboard.spec.ts --project=chromium --reporter=line`
    Steps:    Open dashboard module at 390x900 and 1440x1000; toggle weekly/monthly/all-time controls.
    Expected: KPI cards and labels remain inside viewport with `scrollWidth <= innerWidth`.
    Evidence: .omo/evidence/task-13-dashboard-overflow.json
  ```

  Commit: YES | Message: `feat(app): add deterministic insights modules` | Files: [target/report/dashboard components, tests/e2e/report-dashboard.spec.ts, app state fixtures if needed]

- [ ] 14. Add Admin/Debug and Credential-Gated Production Visibility

  What to do: Add an internal debug module or protected route that surfaces redacted integration mode, missing credential names, latest job runs, audit logs, GBP status, and blocked production verification checks. Keep it useful for the owner/developer without expanding product scope.
  Must NOT do: Do not expose raw tokens, authorization headers, client secrets, or live external calls in default tests.

  Parallelization: Can parallel: YES | Wave 4 | Blocks: [15] | Blocked by: [5, 7, 10]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/integrations/index.ts:24` - central adapter selection.
  - Pattern:  `src/integrations/index.ts:28` - production mode opt-in via env.
  - Pattern:  `src/integrations/production.ts:17` - Naver/Google env var requirements.
  - Pattern:  `src/integrations/production.ts:43` - production Naver request spec.
  - Pattern:  `src/integrations/production.ts:88` - production GBP location request spec.
  - Pattern:  `src/integrations/production.ts:118` - production local posts request spec.
  - Pattern:  `src/integrations/production.ts:142` - production reviews request spec.
  - Pattern:  `src/server/db/migrations/0001_glocalx_schema.sql:125` - `job_runs` table.
  - Pattern:  `src/server/db/migrations/0001_glocalx_schema.sql:137` - `audit_logs` table.
  - Pattern:  `src/server/db/sqlite.ts:224` - seeded job run.
  - Pattern:  `src/server/db/sqlite.ts:240` - seeded audit log with redacted payload.
  - Test:     `src/integrations/missing-credentials.test.ts:1` - credential-blocking test pattern.

  Acceptance criteria (agent-executable only):
  - [ ] Debug surface is accessible only to authenticated demo users.
  - [ ] It shows `APP_INTEGRATION_MODE`, missing env var names, current GBP location status, recent job runs, and recent audit log actions.
  - [ ] It never renders values matching `encrypted:*`, `Bearer `, `NAVER_CLIENT_SECRET`, `GOOGLE_CLIENT_SECRET`, or raw token strings.
  - [ ] Production-mode verification records `BLOCKED_BY_CREDENTIALS` when env vars are absent.
  - [ ] `npx playwright test tests/e2e/admin-debug.spec.ts --project=chromium --reporter=line` exits 0.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Debug route shows redacted integration status
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/admin-debug.spec.ts --project=chromium --reporter=line`
    Steps:    Demo-login and open the debug route/module.
    Expected: Integration mode, missing env names, job rows, and audit rows are visible; raw secrets are absent.
    Evidence: .omo/evidence/task-14-debug-redacted.png

  Scenario: Unauthenticated debug access is blocked
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/admin-debug.spec.ts --project=chromium --reporter=line`
    Steps:    Clear cookies and visit debug route/module URL.
    Expected: User is redirected to `/` or receives 401; debug data is not visible.
    Evidence: .omo/evidence/task-14-debug-auth.txt
  ```

  Commit: YES | Message: `feat(admin): expose redacted integration debug state` | Files: [src/app/app debug module or src/app/debug route, app state/read-model helpers, tests/e2e/admin-debug.spec.ts]

- [ ] 15. Full Regression Evidence and Documentation Polish

  What to do: Run the complete verification suite, capture mobile/desktop screenshots and overflow JSON, update README and `.env.example` with the actual app flow and credential-gated production behavior, and ensure commit history is clean and plan-referenced.
  Must NOT do: Do not mark the goal complete if any evidence file is missing or any final verification agent rejects the work.

  Parallelization: Can parallel: NO | Wave 4 | Blocks: [final verification] | Blocked by: [8, 9, 10, 11, 12, 13, 14]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `README.md:1` - current docs entrypoint.
  - Pattern:  `.env.example` - credential placeholders and integration mode names.
  - Pattern:  `package.json:5` - full verification commands.
  - Pattern:  `playwright.config.ts:1` - real Chrome config.
  - Pattern:  `.omo/plans/glocalx-unified-mvp-design-integration.md:1` - plan path to reference in final commit footer.
  - External: `https://developers.naver.com/docs/serviceapi/search/local/local.md` - docs link for required Naver credentials.
  - External: `https://developers.google.com/my-business/reference/businessinformation/rest/v1/accounts.locations/create` - docs link for required GBP setup credentials/scope.
  - External: `https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts/create` - docs link for post scope.
  - External: `https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list` - docs link for verified-location review sync.
  - External: `https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/updateReply` - docs link for verified-location review reply.

  Acceptance criteria (agent-executable only):
  - [ ] `npm run typecheck` exits 0 and output is saved to `.omo/evidence/task-15-typecheck.txt`.
  - [ ] `npm run lint` exits 0 and output is saved to `.omo/evidence/task-15-lint.txt`.
  - [ ] `npm run test` exits 0 and output is saved to `.omo/evidence/task-15-vitest.txt`.
  - [ ] `npm run build` exits 0 and output is saved to `.omo/evidence/task-15-build.txt`.
  - [ ] `npm run e2e` exits 0 and output is saved to `.omo/evidence/task-15-e2e.txt`.
  - [ ] `.omo/evidence/task-15-mobile.png`, `.omo/evidence/task-15-desktop.png`, and `.omo/evidence/task-15-overflow.json` are captured.
  - [ ] README documents stub happy path, production credential blockers, and no-Instagram/no-live-analytics boundaries.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Complete stub happy path
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/full-mvp-flow.spec.ts --project=chromium --reporter=line`
    Steps:    Visit `/`, demo-login, complete onboarding with `https://naver.me/mybrunchcafe`, run GBP setup, enter `/app`, create GBP post draft, publish or see verified-location block, sync review, select reply tone, open target/report/dashboard.
    Expected: Full path completes without uncaught errors; every screen shows route-backed or explicit stub-preview state.
    Evidence: .omo/evidence/task-15-full-flow.png

  Scenario: Final responsive overflow check
    Tool:     playwright(real Chrome) via `npx playwright test tests/e2e/final-responsive.spec.ts --project=chromium --reporter=line`
    Steps:    Capture `/`, `/onboarding`, and `/app` at 390x900 and 1440x1000; evaluate document scroll widths.
    Expected: `document.documentElement.scrollWidth <= window.innerWidth` for every checked viewport and route.
    Evidence: .omo/evidence/task-15-overflow.json
  ```

  Commit: YES | Message: `docs(app): document unified mvp flow` | Files: [README.md, .env.example, final e2e specs, .omo/evidence/task-15-*]

## Final verification wave (MANDATORY - after all implementation tasks)
> Runs in PARALLEL. ALL must APPROVE. Surface results to the caller after agent-executed verification; do not require the caller to perform manual QA.
- [ ] F1. Plan compliance audit - every task done, every acceptance criterion met
- [ ] F2. Code quality review - diagnostics clean, idioms match, no dead code
- [ ] F3. Real manual QA - every QA scenario executed with evidence captured
- [ ] F4. Scope fidelity - nothing extra shipped beyond Must-Have, nothing Must-NOT-Have introduced

## Commit strategy
- Task-level `Commit: YES` entries are draft commit recommendations only. Do not run `git commit` unless the user explicitly authorizes commits for the execution session.
- One logical change per commit. Conventional Commits (`<type>(<scope>): <subject>` body + footer).
- Atomic: every commit builds and passes tests on its own.
- No "WIP" / "fix typo squash later" commits on the final branch - clean up before merge.
- Reference the plan file path in the final commit footer: `Plan: .omo/plans/glocalx-unified-mvp-design-integration.md`.

## Success criteria
- All Must-Have shipped; all QA scenarios pass with captured evidence; F1-F4 approved; commit history clean.
