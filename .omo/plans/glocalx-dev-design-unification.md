# GlocalX Dev And Design Unification Plan

## TL;DR
> Summary:      Merge the already-built GlocalX MVP integration spine with the finalized Vite design by preserving the current Next.js App Router routes, cookies, APIs, database contracts, and stub/production adapters while porting the visual system and completing missing review/admin/readiness work.
> Deliverables:
> - Next-safe design tokens, app shell primitives, and Korean UI copy derived from `02_assets/glocalx-mvp-design/`.
> - Redesigned `/`, `/onboarding`, and `/app` surfaces wired to existing auth, extraction, GBP setup, post draft/publish, and new review sync/reply contracts.
> - Review backend routes/services, lightweight jobs/audit/readiness plumbing, admin/debug surface, scope docs, and Playwright evidence.
> - Full quality gate and browser QA evidence for mobile `390x900` and desktop `1440x1000`.
> Effort:       Large
> Risk:         Medium - the backend spine is mostly present, but UI copy/selector churn, missing review routes, and prototype scope creep can regress guarded flows if not sequenced tightly.

## Scope
### Current execution override
- Execute only the merge between the already-developed Next.js app and the provided design reference.
- Do not implement new product capabilities, new backend contracts, admin/debug surfaces, review APIs, jobs/audit/readiness foundations, target-country analytics, reporting automation, coupon attribution, scheduler behavior, or other prototype-only functionality.
- Scope-skipped tasks are marked complete only as explicit non-implementation decisions from this override; they must not create source changes.

### Must have
- Preserve existing guarded route flow: `/` -> `/api/auth/demo-login` -> `/onboarding` or `/app`, with `/onboarding` and `/app` continuing to call `getDemoSession()` server-side.
- Preserve existing API contracts for `/api/onboarding/extractions`, `/api/gbp/setup`, `/api/posts/drafts`, and `/api/posts/[draftId]/publish`.
- Complete the missing GBP review sync/reply backend because database tables and adapters exist, but no `src/app/api/reviews/**` route is present.
- Use `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx` as the design and interaction reference and `02_assets/glocalx-mvp-design/client/src/index.css` as token reference.
- Keep `02_assets/glocalx-mvp-design/` immutable.
- Keep user-facing UI copy Korean; keep code, tests, docs, env names, and commit messages English.
- Follow local Next 16 canary docs before implementation: async `cookies()`, route handler placement, async dynamic `params`, global CSS through root layout, and narrow client boundaries.
- Use stub/demo E2E as the default verification path; production live checks must be credential-gated and report `BLOCKED_BY_CREDENTIALS`.
- Capture agent-executed evidence under `.omo/evidence/` for every task.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not wholesale copy the 1,800+ line Vite `Home.tsx` into the Next app.
- Do not add Wouter, Vite runtime routing, Radix/shadcn providers, `sonner`, Recharts, Framer Motion, `tw-animate-css`, or `next-themes` unless a later explicit task proves the need and adds tests.
- Do not replace server redirects with client-only route gating.
- Do not expand real auth to Kakao/email; non-demo auth buttons must be disabled or clearly non-functional.
- Do not claim Instagram, target-country analytics, coupon attribution, weekly report automation, AI image/video generation, or scheduler automation as production-ready.
- Do not scrape Naver pages; use official Local Search API request specs and manual fallback only.
- Do not expose real tokens or secret-like values in UI, logs, tests, docs, screenshots, or evidence.
- Do not weaken contract tests just to fit redesigned copy; update assertions toward stable roles/behavior.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD + Vitest for domain/route/component contracts and Playwright with real Chrome for browser E2E.
- QA policy: every task has agent-executed scenarios
- Evidence: `.omo/evidence/task-<N>-<slug>.<ext>`

## Execution strategy
### Parallel execution waves
> Target 5-8 tasks per wave. Wave 1 is intentionally serial because it captures dirty worktree state before any implementation edits.
> Extract shared dependencies as Wave-1 tasks to maximize parallelism.

Wave 1 (no dependencies):
- Task 1: Preflight reconciliation, baseline evidence, and Next/doc reread

Wave 2 (after Wave 1):
- Task 2: depends [1]
- Task 3: depends [1]
- Task 6: depends [1]
- Task 7: depends [1]
- Task 12: depends [1]

Wave 3 (after Wave 2):
- Task 4: depends [2, 3]
- Task 5: depends [2, 3]
- Task 8: depends [2, 3, 5]
- Task 9: depends [2, 3, 6]
- Task 10: depends [2, 3]
- Task 11: depends [6, 7]

Wave 4 (after Wave 3):
- Task 13: depends [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

Critical path: Task 1 -> Task 2 -> Task 3 -> Task 5 -> Task 8 -> Task 13

### Dependency matrix
| Task | Depends on | Blocks | Can parallelize with |
|------|------------|--------|----------------------|
| 1 | none | 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13 | none |
| 2 | 1 | 4, 5, 8, 9, 10, 13 | 3, 6, 7, 12 |
| 3 | 1 | 4, 5, 8, 9, 10, 13 | 2, 6, 7, 12 |
| 4 | 2, 3 | 13 | 5, 9, 10, 11 |
| 5 | 2, 3 | 8, 13 | 4, 9, 10, 11 |
| 6 | 1 | 9, 11, 13 | 2, 3, 7, 12 |
| 7 | 1 | 11, 13 | 2, 3, 6, 12 |
| 8 | 2, 3, 5 | 13 | 9, 10, 11 |
| 9 | 2, 3, 6 | 13 | 4, 5, 8, 10, 11 |
| 10 | 2, 3 | 13 | 4, 5, 8, 9, 11 |
| 11 | 6, 7 | 13 | 4, 5, 8, 9, 10 |
| 12 | 1 | 13 | 2, 3, 6, 7 |
| 13 | 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 | final verification | none |

## Todos
> Implementation + Test = ONE task. Never separate.
> Every task MUST have: References + Acceptance Criteria + QA Scenarios + Commit.

- [x] 1. Preflight Reconciliation And Baseline Evidence

  What to do: Capture the current dirty worktree, line-reference all target files, reconcile what is already complete from `.omo/plans/glocalx-mvp-priority-integrations.md` against what remains from `.omo/plans/glocalx-design-integration.md`, and reread local Next 16 docs before source edits. Record review-route absence/presence and baseline tests before implementation begins.
  Must NOT do: Do not edit source, tests, design assets, or docs. Do not stage/revert/delete unrelated work. Do not assume old plan checkboxes are correct without checking current files.

  Parallelization: Can parallel: NO | Wave 1 | Blocks: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `git status --short` - current dirty state includes modified `next-env.d.ts` and untracked `.omo/drafts/`, `.omo/evidence/plan-integrity-tmux.txt`, `.omo/plans/glocalx-design-integration.md`, `01_documents/`, and `02_assets/`.
  - Pattern:  `.omo/plans/glocalx-mvp-priority-integrations.md:135` - Tasks 1-7 are marked complete, while review/admin/jobs/readiness/e2e/docs tasks remain open.
  - Pattern:  `.omo/plans/glocalx-design-integration.md:144` - existing design plan starts with a serial preflight and baseline task.
  - Pattern:  `src/app/page.tsx:55` - current landing form posts to `/api/auth/demo-login`.
  - Pattern:  `src/app/onboarding/page.tsx:5` - current onboarding page is a server component with guard redirects.
  - Pattern:  `src/app/app/page.tsx:5` - current app page is a server component with guard redirects.
  - Pattern:  `src/app/api/posts/drafts/route.ts:34` - post draft route exists.
  - Pattern:  `src/app/api/posts/[draftId]/publish/route.ts:40` - publish route exists and awaits async dynamic `params`.
  - Pattern:  `src/integrations/contracts.ts:84` - GBP review adapter interface exists.
  - Pattern:  `src/server/db/migrations/0001_glocalx_schema.sql:99` - review tables exist in the database.
  - Pattern:  `rg --files src/app/api/reviews src/reviews tests/e2e` - verify missing review routes/services before Task 6.
  - External: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md:67` - `cookies()` is async.
  - External: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md:25` - App Router route handlers live under `app`.
  - External: `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md:174` - `"use client"` defines the client boundary.
  - External: `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md:250` - global CSS applies across the app and should be truly global.

  Acceptance criteria (agent-executable only):
  - [ ] `bash -lc 'git status --short | tee .omo/evidence/task-1-git-status.txt'` exits 0 and records current worktree state.
  - [ ] `bash -lc 'rg --files src tests package.json playwright.config.ts vitest.config.ts .env.example README.md | sort | tee .omo/evidence/task-1-target-files.txt'` exits 0 and lists all implementation surfaces.
  - [ ] `bash -lc 'rg --files src/app/api/reviews src/reviews tests/e2e 2>&1 | tee .omo/evidence/task-1-review-route-presence.txt'` records whether review route/service files exist.
  - [ ] `bash -lc 'npm run typecheck > .omo/evidence/task-1-typecheck-baseline.txt 2>&1; npm run test > .omo/evidence/task-1-vitest-baseline.txt 2>&1; npm run e2e -- --project=chromium --grep \"First-time demo login|Stub post draft\" > .omo/evidence/task-1-e2e-baseline.txt 2>&1'` records baseline output without modifying source.
  - [ ] `.omo/evidence/task-1-next-docs-read.txt` lists the local Next docs files and line ranges read by the executor.

  QA scenarios (MANDATORY - task incomplete without these):
  > Name the exact tool AND its exact invocation - not "verify it works". Browser use: use Chrome to drive the page; if Chrome is not available, download and use agent-browser (https://github.com/vercel-labs/agent-browser). Computer use: OS-level GUI automation for a non-browser desktop app.
  ```
  Scenario: Current landing route is reachable
    Tool:     playwright(real Chrome)
    Steps:    npm run e2e -- --project=chromium --grep "App boot|First-time demo login" --reporter=list
    Expected: The command exits 0 or records the exact current failure in .omo/evidence/task-1-e2e-baseline.txt; no source file is modified.
    Evidence: .omo/evidence/task-1-e2e-baseline.txt

  Scenario: Current protected app route redirects
    Tool:     playwright(real Chrome)
    Steps:    npm run e2e -- --project=chromium --grep "Protected app route redirects" --reporter=list
    Expected: The command exits 0 or records the exact current failure; unauthenticated /app does not show protected app content.
    Evidence: .omo/evidence/task-1-protected-route-baseline.txt
  ```

  Commit: NO | Message: `n/a` | Files: [.omo/evidence/task-1-*]

- [x] 2. Port Next-Safe Design Tokens And Global Base

  What to do: Replace the pale scaffold token set with a Next-compatible subset of the finalized design tokens in `src/app/globals.css`, keep Tailwind import first, keep `src/app/layout.tsx` importing `./globals.css`, add global overflow and typography constraints, and add a style contract test that locks token names without copying the whole prototype stylesheet.
  Must NOT do: Do not import `tw-animate-css`. Do not copy all prototype classes. Do not mutate `02_assets/glocalx-mvp-design/client/src/index.css`. Do not add a theme provider.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [4, 5, 8, 9, 10, 13] | Blocked by: [1]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/app/globals.css:1` - Tailwind import currently comes first.
  - Pattern:  `src/app/globals.css:3` - current app token set is light/pale and will be replaced/expanded.
  - Pattern:  `src/app/layout.tsx:3` - root layout imports `./globals.css`.
  - Pattern:  `src/app/layout.tsx:21` - root layout already uses `<html lang="ko">`.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/index.css:45` - finalized token names and values.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/index.css:72` - finalized body typography/background/overflow base.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/index.css:84` - prototype board/stage classes are reference-only, not to be pasted wholesale.
  - External: `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md:56` - Tailwind import belongs in global CSS.
  - External: `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md:62` - root layout imports the global CSS file.
  - External: `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md:294` - global styles should stay truly global to avoid route conflicts.
  - Test:     `src/lib/app-shell.test.ts` - existing static shell test pattern.

  Acceptance criteria (agent-executable only):
  - [ ] `src/app/globals.css` keeps `@import "tailwindcss";` as line 1.
  - [ ] `src/app/globals.css` defines at least `--ink`, `--ink-soft`, `--line`, `--canvas`, `--canvas-2`, `--accent`, `--accent-press`, `--accent-soft`, `--mint`, `--mint-soft`, `--blue`, `--phone-bg`, `--card`, `--shadow`, and `--r`.
  - [ ] `src/app/globals.css` includes `overflow-x: hidden` or equivalent responsive overflow prevention on the document/body.
  - [ ] `src/app/layout.tsx` still imports `./globals.css` and keeps `<html lang="ko">`.
  - [ ] `npm run typecheck`, `npm run lint`, and `npm run test -- --run globals` exit 0.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Desktop design base renders dark canvas
    Tool:     playwright(real Chrome)
    Steps:    npm run e2e -- --project=chromium --grep "design base desktop" --reporter=list
    Expected: The test captures / at 1440x1000 and asserts computed body background is not the old #f7f8f3 scaffold.
    Evidence: .omo/evidence/task-2-design-base-desktop.png

  Scenario: Mobile design base has no horizontal overflow
    Tool:     playwright(real Chrome)
    Steps:    npm run e2e -- --project=chromium --grep "design base mobile overflow" --reporter=list
    Expected: The test records documentElement.scrollWidth <= window.innerWidth at 390x900.
    Evidence: .omo/evidence/task-2-mobile-overflow.json
  ```

  Commit: YES | Message: `feat(ui): port finalized design tokens` | Files: [src/app/globals.css, src/app/layout.tsx, src/app/globals.test.ts or equivalent, tests/e2e/design-base.spec.ts]

- [x] 3. Build App Shell And Client Primitive Layer

  What to do: Create focused reusable primitives for the finalized experience: app stage, step navigation, phone/mobile frame, chat message, action chip, status card, metric card, and toast-free inline feedback. Put browser state behind small `"use client"` files and keep server pages as wrappers around protected flows.
  Must NOT do: Do not put all prototype state in one mega-component. Do not import server-only modules into client components. Do not exceed 250 pure LOC in any new implementation file.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [4, 5, 8, 9, 10, 13] | Blocked by: [1]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:12` - prototype screen metadata to map into step navigation.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:23` - chat node shape to translate into typed primitives.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:103` - prototype screen loader is reference-only and should not become app architecture.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1811` - board/nav/phone composition to adapt.
  - Pattern:  `src/app/onboarding/page.tsx:5` - protected server page must remain a server wrapper.
  - Pattern:  `src/app/app/page.tsx:5` - protected app page must remain a server wrapper.
  - External: `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md:11` - pages/layouts are Server Components by default.
  - External: `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md:184` - keep client boundaries small.
  - External: `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md:293` - props passed to Client Components must be serializable.
  - Test:     `vitest.config.ts:13` - Vitest runs in node environment and excludes E2E.

  Acceptance criteria (agent-executable only):
  - [ ] New primitives live under a focused path such as `src/app/_components/` or `src/components/app-shell/`.
  - [ ] Every file using `useState`, `useEffect`, `window`, timers, or event handlers starts with `"use client"`.
  - [ ] Server pages import only serializable client wrappers and do not import hooks directly.
  - [ ] Component tests cover active step navigation, disabled action chips, chat message rendering, and status-card variants.
  - [ ] `bash -lc 'find src -path \"*.tsx\" -not -path \"*/node_modules/*\" -print0 | xargs -0 wc -l | tee .omo/evidence/task-3-loc-check.txt'` records no new implementation file over 250 pure LOC.
  - [ ] `npm run typecheck`, `npm run lint`, and `npm run test -- --run shell` exit 0.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Step navigation is keyboard reachable
    Tool:     playwright(real Chrome)
    Steps:    npm run e2e -- --project=chromium --grep "step navigation keyboard" --reporter=list
    Expected: Tab focus reaches each step button; Enter changes the active step without a page reload.
    Evidence: .omo/evidence/task-3-step-nav-keyboard.txt

  Scenario: Mobile shell frame remains usable
    Tool:     playwright(real Chrome)
    Steps:    npm run e2e -- --project=chromium --grep "mobile shell frame" --reporter=list
    Expected: At 390x900, the app shell content is visible, controls are not clipped, and overflow JSON passes.
    Evidence: .omo/evidence/task-3-mobile-shell.png
  ```

  Commit: YES | Message: `feat(ui): add app shell primitives` | Files: [src/app/_components/**, src/components/** if used, component tests, tests/e2e/app-shell.spec.ts]

- [x] 4. Redesign Landing Around Real Demo Auth

  What to do: Rebuild `/` as the finalized login/landing surface while preserving the real `<form method="post" action="/api/auth/demo-login">` path. Keep one functional primary demo CTA. If Kakao/Google/email visual buttons are retained for design fidelity, mark all non-demo options disabled or coming soon and ensure they do not set cookies.
  Must NOT do: Do not implement Kakao/email auth. Do not use prototype `toast.success` flow. Do not route to onboarding via local React state.

  Parallelization: Can parallel: YES | Wave 3 | Blocks: [13] | Blocked by: [2, 3]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/app/page.tsx:11` - current landing route component.
  - Pattern:  `src/app/page.tsx:55` - current real demo-login form contract.
  - Pattern:  `src/lib/app-shell.ts:9` - current shared landing copy.
  - Pattern:  `src/app/api/auth/demo-login/route.ts:14` - POST route creates demo session.
  - Pattern:  `src/app/api/auth/demo-login/route.ts:21` - redirect target depends on onboarding cookie.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:653` - finalized login screen.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:667` - prototype auth buttons, all currently fake.
  - Test:     `tests/e2e/auth-flow.spec.ts:3` - first-login redirect test.
  - Test:     `tests/e2e/app-boot.spec.ts` - shell smoke copy likely needs update.
  - External: `node_modules/next/dist/docs/01-app/02-guides/forms.md` - forms guide to reread if changing form mechanics.
  - External: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md:205` - redirect status semantics preserve POST for 307; current route intentionally returns 303.

  Acceptance criteria (agent-executable only):
  - [ ] A Playwright test is updated/written first and fails before UI implementation for the new primary demo CTA behavior.
  - [ ] `/` renders the finalized brand mark, headline, supporting copy, and primary CTA in Korean.
  - [ ] Primary CTA submits `POST /api/auth/demo-login` and reaches `/onboarding` with fresh cookies.
  - [ ] Returning demo users with onboarding-complete cookie still reach `/app`.
  - [ ] Non-demo auth affordances, if present, do not set `glocalx_demo_session` or navigate to protected pages.
  - [ ] `npm run e2e -- --project=chromium --grep "demo login|auth placeholder"` exits 0.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: First-time demo login starts onboarding
    Tool:     playwright(real Chrome)
    Steps:    npm run e2e -- --project=chromium --grep "First-time demo login routes to onboarding" --reporter=list
    Expected: Fresh visitor clicks the redesigned primary CTA, lands on /onboarding, and sees the onboarding prompt.
    Evidence: .omo/evidence/task-4-demo-login.txt

  Scenario: Non-demo auth buttons do not fake success
    Tool:     playwright(real Chrome)
    Steps:    npm run e2e -- --project=chromium --grep "auth placeholders stay inert" --reporter=list
    Expected: Clicking any visible Kakao/email/secondary auth option leaves the user on / and no demo session cookie is created.
    Evidence: .omo/evidence/task-4-auth-placeholder.txt
  ```

  Commit: YES | Message: `feat(ui): redesign landing auth surface` | Files: [src/app/page.tsx, src/lib/app-shell.ts or replacement copy module, tests/e2e/auth-flow.spec.ts, tests/e2e/app-boot.spec.ts, relevant component tests]

- [x] 5. Connect Onboarding UX To Extraction, GBP Setup, And Completion

  What to do: Replace the static onboarding form with the finalized chat/card flow. Submit input to `/api/onboarding/extractions`, show candidate/manual fallback/error states, collect missing hours locally, call `/api/gbp/setup`, then post to `/api/onboarding/complete` only after the candidate and GBP setup result are visible. Preserve server guard redirects.
  Must NOT do: Do not mark onboarding complete before extraction/setup is visible. Do not claim live GBP verification when the API returns `VERIFICATION_PENDING`, `CLAIM_REQUIRED`, or `BLOCKED_BY_CREDENTIALS`. Do not reshape existing route payload schemas.

  Parallelization: Can parallel: YES | Wave 3 | Blocks: [8, 13] | Blocked by: [2, 3]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/app/onboarding/page.tsx:5` - current server guard wrapper.
  - Pattern:  `src/app/onboarding/page.tsx:29` - current form incorrectly posts directly to completion.
  - Pattern:  `src/app/api/onboarding/extractions/route.ts:71` - extraction POST route.
  - Pattern:  `src/app/api/gbp/setup/route.ts:34` - GBP setup POST route.
  - Pattern:  `src/app/api/onboarding/complete/route.ts:11` - completion route sets onboarding cookie and redirects.
  - API/Type: `src/domain/schemas.ts:5` - extraction request schema.
  - API/Type: `src/domain/schemas.ts:26` - GBP setup request schema.
  - Pattern:  `src/integrations/stub.ts:17` - deterministic Naver candidate data.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:143` - onboarding chat initializer.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:332` - candidate and missing-hours flow.
  - Pattern:  `02_assets/glocalx-mvp-design/REVIEW_NOTES.md:13` - finalized review notes call out missing error states.
  - Test:     `tests/e2e/onboarding-extraction.spec.ts` - existing extraction contract assertions.
  - Test:     `tests/e2e/gbp-setup.spec.ts` - existing GBP setup contract assertions.

  Acceptance criteria (agent-executable only):
  - [ ] Tests are written/updated RED first for Naver success, no-result fallback, malformed input, GBP setup pending, and completion timing.
  - [ ] `/onboarding` still redirects unauthenticated visitors to `/`.
  - [ ] Submitting `https://naver.me/mybrunchcafe` renders `브런치모먼트 홍대점`, `hours` missing state, and an owner-friendly Korean prompt.
  - [ ] Submitting `없는가게zzzz` renders the API manual-input fallback and keeps the user on `/onboarding`.
  - [ ] GBP setup displays returned status, audit id, and follow-up job id without exposing secrets.
  - [ ] Completion route is invoked only after the user confirms the visible setup result.
  - [ ] `npm run test -- --run extraction` and `npm run e2e -- --project=chromium --grep "onboarding"` exit 0.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Successful extraction and GBP setup
    Tool:     playwright(real Chrome)
    Steps:    npm run e2e -- --project=chromium --grep "successful onboarding extraction and gbp setup" --reporter=list
    Expected: Login -> /onboarding -> submit https://naver.me/mybrunchcafe -> candidate visible -> GBP status visible -> complete -> /app.
    Evidence: .omo/evidence/task-5-onboarding-success.png

  Scenario: No Naver result falls back to manual entry
    Tool:     playwright(real Chrome)
    Steps:    npm run e2e -- --project=chromium --grep "onboarding no result manual fallback" --reporter=list
    Expected: Input 없는가게zzzz shows manual fallback from the API and does not complete onboarding.
    Evidence: .omo/evidence/task-5-onboarding-fallback.png
  ```

  Commit: YES | Message: `feat(onboarding): wire finalized setup flow` | Files: [src/app/onboarding/page.tsx, onboarding client components/actions, src/domain/schemas.ts if strictly needed, tests/e2e/onboarding-extraction.spec.ts, tests/e2e/auth-flow.spec.ts, component tests]

- [x] 6. Scope-Skipped: Implement GBP Review Sync And Reply Backend Contracts

  What to do: Add review domain services/repository methods and App Router routes for `POST /api/reviews/sync` and `PUT /api/reviews/[reviewId]/reply`. Use existing review tables and GBP review adapters. In stub mode, import deterministic seeded/fixed reviews and generate three reply choices. In production mode, build request specs via adapters and return `BLOCKED_BY_CREDENTIALS` when credentials are absent. Block reply publishing until GBP location is verified.
  Must NOT do: Do not give legal advice for malicious reviews. Do not auto-reply to malicious/spam fixtures. Do not bypass `canUseLiveGbpActions`. Do not store duplicate reviews.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [9, 11, 13] | Blocked by: [1]

  References (executor has NO interview context - be exhaustive):
  - API/Type: `src/integrations/contracts.ts:53` - review list input contract.
  - API/Type: `src/integrations/contracts.ts:60` - review reply input contract.
  - API/Type: `src/integrations/contracts.ts:84` - `GbpReviewsAdapter`.
  - Pattern:  `src/integrations/stub.ts:126` - stub review adapter exists.
  - Pattern:  `src/integrations/production.ts:142` - production reviews request builders exist.
  - Pattern:  `src/server/db/migrations/0001_glocalx_schema.sql:99` - `reviews` table.
  - Pattern:  `src/server/db/migrations/0001_glocalx_schema.sql:114` - `review_replies` table.
  - Pattern:  `src/server/db/sqlite.ts:191` - seeded demo review.
  - Pattern:  `src/server/db/sqlite.ts:209` - seeded demo reply.
  - API/Type: `src/gbp/state-machine.ts` - live action gate used by posts and should be reused for review replies.
  - Test:     `src/gbp/gbp-location-state-machine.test.ts:12` - existing test states live posts and review replies are blocked until verified.
  - External: `https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list` - official reviews list method.
  - External: `https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/updateReply` - official review reply method.

  Acceptance criteria (agent-executable only):
  - [ ] `src/domain/schemas.ts` or a review schema module validates sync and reply payloads strictly.
  - [ ] `POST /api/reviews/sync` imports stub reviews idempotently and returns imported count, total count, and safe reply suggestion metadata.
  - [ ] `PUT /api/reviews/[reviewId]/reply` stores selected reply and returns `REPLIED` only when live action gate allows publishing or stub verified state is active.
  - [ ] Malicious/spam review fixtures return safe reporting guidance and no normal reply options.
  - [ ] Duplicate sync calls import 0 new reviews on the second call.
  - [ ] Production adapter tests assert exact reviews list and updateReply method/url/scopes/body.
  - [ ] `npm run test -- --run review` and `npm run e2e -- --project=chromium --grep "review api"` exit 0.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Stub review sync and reply
    Tool:     bash
    Steps:    npm run dev -- --hostname 127.0.0.1 --port 3000 > .omo/evidence/task-6-dev-server.txt 2>&1 & sleep 8; curl -sS -X POST http://127.0.0.1:3000/api/reviews/sync -H 'Content-Type: application/json' -d '{"storeId":"demo-store"}' | tee .omo/evidence/task-6-review-sync.json; curl -sS -X PUT http://127.0.0.1:3000/api/reviews/demo-review/reply -H 'Content-Type: application/json' -d '{"storeId":"demo-store","selectedTone":"polite"}' | tee .omo/evidence/task-6-review-reply.json
    Expected: Sync returns at least one review; reply returns REPLIED or DRAFT/PUBLISHED according to verified stub state with no secret values.
    Evidence: .omo/evidence/task-6-review-sync.json, .omo/evidence/task-6-review-reply.json

  Scenario: Malicious review safe handling
    Tool:     bash
    Steps:    npm run test -- --run malicious-review-flow | tee .omo/evidence/task-6-malicious-review.txt
    Expected: Malicious fixture has no normal reply options and returns platform reporting guidance only.
    Evidence: .omo/evidence/task-6-malicious-review.txt
  ```

  Commit: YES | Message: `feat(reviews): add sync and reply contracts` | Files: [src/reviews/**, src/app/api/reviews/sync/route.ts, src/app/api/reviews/[reviewId]/reply/route.ts, src/domain/schemas.ts or review schemas, src/integrations/** tests, tests/e2e/review-api.spec.ts]

- [x] 7. Scope-Skipped: Add Jobs, Audit, Idempotency, And Credential Readiness Foundation

  What to do: Add a lightweight local job/audit service and a credential readiness command. Reuse existing `job_runs` and `audit_logs` tables. Ensure setup, post publish, and review reply side effects record redacted audit logs and idempotency keys. Add `npm run integrations:check` to print safe readiness for Naver, Google OAuth, GBP local posts, and reviews.
  Must NOT do: Do not require hosted queues. Do not fail normal CI when credentials are absent. Do not log real token values. Do not remove existing post idempotency behavior.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [11, 13] | Blocked by: [1]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/server/db/migrations/0001_glocalx_schema.sql:87` - post publish attempts have unique idempotency keys.
  - Pattern:  `src/server/db/migrations/0001_glocalx_schema.sql:125` - `job_runs` table exists.
  - Pattern:  `src/server/db/migrations/0001_glocalx_schema.sql:137` - `audit_logs` table exists.
  - Pattern:  `src/posts/post-flow.ts:129` - post publish currently derives idempotency key.
  - Pattern:  `src/posts/post-flow.ts:150` - publish retry limit returns manual guidance after 3 failures.
  - Pattern:  `src/integrations/credentials.ts` - credential gating helpers.
  - Pattern:  `package.json:4` - scripts block where `integrations:check` should be added.
  - Pattern:  `.env.example` - env placeholders must be expanded without secrets.
  - External: `https://developers.naver.com/docs/serviceapi/search/local/local.md` - Naver requires Client ID/Secret request headers.
  - External: `https://developers.google.com/my-business/reference/rest/` - Google Business Profile APIs require OAuth access and scopes.

  Acceptance criteria (agent-executable only):
  - [ ] `npm run integrations:check` exists and exits 0 without credentials, printing `BLOCKED_BY_CREDENTIALS` with env var names only.
  - [ ] `.env.example` includes `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_BUSINESS_ACCOUNT_ID`, `TEST_GBP_LOCATION_ID`, `TOKEN_ENCRYPTION_KEY`, `APP_INTEGRATION_MODE`, `RUN_LIVE_INTEGRATION_TESTS`, and `ENABLE_ADMIN_DEBUG`.
  - [ ] Setup, post publish, review sync/reply, and job scheduling write redacted audit entries in stub mode.
  - [ ] Duplicate publish and duplicate review reply create one external/stub side effect.
  - [ ] `RUN_LIVE_INTEGRATION_TESTS=0 npm run test -- --run live-integration-gates` exits 0 and proves live calls are not attempted.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Readiness check without credentials
    Tool:     bash
    Steps:    env -u NAVER_CLIENT_ID -u NAVER_CLIENT_SECRET -u GOOGLE_CLIENT_ID -u GOOGLE_CLIENT_SECRET npm run integrations:check | tee .omo/evidence/task-7-readiness-no-creds.txt
    Expected: Exit code 0; output lists blocked credential groups and contains no secret-like values.
    Evidence: .omo/evidence/task-7-readiness-no-creds.txt

  Scenario: Duplicate side effects are idempotent
    Tool:     bash
    Steps:    npm run test -- --run "post-publish-idempotency|review-reply-idempotency|audit-redaction" | tee .omo/evidence/task-7-idempotency-audit.txt
    Expected: Tests assert one external/stub attempt for duplicate requests and redacted audit payloads.
    Evidence: .omo/evidence/task-7-idempotency-audit.txt
  ```

  Commit: YES | Message: `feat(ops): add readiness jobs and audit logs` | Files: [src/jobs/**, src/audit/**, scripts/integrations-check.ts, package.json, .env.example, README.md if command docs needed, tests]

- [x] 8. Connect `/app` Post Draft And Publish UI

  What to do: Build the finalized posting workspace inside `/app` using shared primitives. Show owner intent input, design-inspired asset/intention preparation cards as UI-only preparation states, call `/api/posts/drafts` for the draft preview, publish through `/api/posts/[draftId]/publish`, and surface 409 `LOCATION_NOT_VERIFIED` or retry-limit guidance without hiding it.
  Must NOT do: Do not show Instagram publish as real. Do not hardcode draft preview after API integration. Do not fabricate publish success when API returns 409.

  Parallelization: Can parallel: YES | Wave 3 | Blocks: [13] | Blocked by: [2, 3, 5]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/app/app/page.tsx:5` - current protected app page wrapper.
  - Pattern:  `src/app/app/page.tsx:16` - current placeholder dashboard shell.
  - API/Type: `src/domain/schemas.ts:33` - post draft request schema.
  - API/Type: `src/domain/schemas.ts:41` - post publish request schema.
  - Pattern:  `src/app/api/posts/drafts/route.ts:34` - draft POST route.
  - Pattern:  `src/app/api/posts/[draftId]/publish/route.ts:40` - publish POST route.
  - Pattern:  `src/posts/post-flow.ts:67` - draft creation logic.
  - Pattern:  `src/posts/post-flow.ts:116` - publish logic.
  - Pattern:  `src/posts/post-flow.ts:121` - publish blocking path.
  - Test:     `tests/e2e/post-publish.spec.ts:11` - draft/publish API E2E.
  - Test:     `tests/e2e/post-publish.spec.ts:55` - unverified location blocking E2E.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:158` - asset preparation narrative.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:273` - posting narrative.
  - External: `https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts/create` - official local post create method.

  Acceptance criteria (agent-executable only):
  - [ ] RED browser tests cover draft success, publish success, and unverified-location blocking from the UI.
  - [ ] `/app` shows a posting step with owner intent input and design-inspired preparation/status cards.
  - [ ] Draft preview Korean/English copy comes from `/api/posts/drafts`.
  - [ ] Publish status comes from `/api/posts/[draftId]/publish`.
  - [ ] `LOCATION_NOT_VERIFIED` and retry-limit messages are visible in Korean and do not show success.
  - [ ] `tests/e2e/post-publish.spec.ts` remains green.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: GBP draft preview appears from API
    Tool:     playwright(real Chrome)
    Steps:    npm run e2e -- --project=chromium --grep "app post draft preview from api" --reporter=list
    Expected: Authenticated/onboarded user enters "주말 브런치 신메뉴 홍보" and sees API copy "브런치모먼트 홍대점에서 주말 브런치 신메뉴 홍보 소식을 전해드립니다."
    Evidence: .omo/evidence/task-8-post-draft.png

  Scenario: Publish blocked state is visible
    Tool:     playwright(real Chrome)
    Steps:    npm run e2e -- --project=chromium --grep "app publish blocked when location unverified" --reporter=list
    Expected: User sees Korean verification-required recovery message and no success state.
    Evidence: .omo/evidence/task-8-post-blocked.png
  ```

  Commit: YES | Message: `feat(posts): connect dashboard publishing ui` | Files: [src/app/app/page.tsx, app/post client components, tests/e2e/post-publish.spec.ts, tests/e2e/app-workspace.spec.ts, component tests]

- [x] 9. Scope-Skipped: Connect Review UI To Review Backend

  What to do: Build the finalized review management surface in `/app`, backed by Task 6 routes. Let owners sync reviews, see deterministic review cards, choose tone options, handle malicious/spam guidance, and publish/store replies through the real review reply route when allowed.
  Must NOT do: Do not present malicious-review handling as legal advice. Do not claim reply was published if the API returns blocked/draft/manual state. Do not use static cards once the backend route exists.

  Parallelization: Can parallel: YES | Wave 3 | Blocks: [13] | Blocked by: [2, 3, 6]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/app/app/page.tsx:5` - app wrapper must preserve server guard.
  - Pattern:  `src/integrations/stub.ts:126` - stub reviews adapter.
  - Pattern:  `src/server/db/sqlite.ts:191` - seeded demo review content.
  - Pattern:  `src/server/db/sqlite.ts:209` - seeded demo reply content.
  - API/Type: `src/app/api/reviews/sync/route.ts` - route created by Task 6.
  - API/Type: `src/app/api/reviews/[reviewId]/reply/route.ts` - route created by Task 6.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:289` - review initializer.
  - Pattern:  `02_assets/glocalx-mvp-design/REVIEW_NOTES.md:59` - malicious review logic gap.
  - External: `https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/updateReply` - official reply method.

  Acceptance criteria (agent-executable only):
  - [ ] RED browser tests cover sync, tone selection, reply submit, blocked unverified reply, and malicious guidance.
  - [ ] Review screen calls `POST /api/reviews/sync` and renders returned reviews.
  - [ ] Tone controls produce deterministic selected state and call `PUT /api/reviews/[reviewId]/reply`.
  - [ ] Malicious/spam review card shows safe reporting guidance and disables normal reply publish.
  - [ ] Unverified GBP location shows the same verification-required recovery message used by posts.
  - [ ] `npm run test -- --run review` and review UI E2E pass.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Review sync and reply from UI
    Tool:     playwright(real Chrome)
    Steps:    npm run e2e -- --project=chromium --grep "review sync and reply ui" --reporter=list
    Expected: User opens Review step, syncs a review, selects polite tone, submits reply, and sees stored/published status from API.
    Evidence: .omo/evidence/task-9-review-reply.png

  Scenario: Malicious review does not offer normal auto-reply
    Tool:     playwright(real Chrome)
    Steps:    npm run e2e -- --project=chromium --grep "malicious review guidance ui" --reporter=list
    Expected: Malicious fixture shows reporting guidance; normal reply publish button is disabled or absent.
    Evidence: .omo/evidence/task-9-malicious-review.png
  ```

  Commit: YES | Message: `feat(reviews): connect review management ui` | Files: [src/app/app/page.tsx, app/review client components, tests/e2e/review-flow.spec.ts, component tests]

- [x] 10. Scope-Skipped: Add Target, Report, And Dashboard Preview Surfaces

  What to do: Port the design's target-country, weekly report, and dashboard surfaces into `/app` as explicit deterministic preview/read-only modules. Use local fixtures and clear owner-facing copy so users understand these are previews until production analytics/scheduler contracts exist. Dashboard period toggles should update deterministic KPI data without adding Recharts.
  Must NOT do: Do not create fake production APIs for coupons, country analytics, weekly scheduler automation, or PDF generation. Do not add Recharts just for static charts.

  Parallelization: Can parallel: YES | Wave 3 | Blocks: [13] | Blocked by: [2, 3]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:303` - target initializer.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:318` - report initializer.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:712` - dashboard period/chart render.
  - Pattern:  `02_assets/glocalx-mvp-design/REVIEW_NOTES.md:64` - target-country data gap.
  - Pattern:  `02_assets/glocalx-mvp-design/REVIEW_NOTES.md:69` - scheduler/reporting gap.
  - Pattern:  `.omo/plans/glocalx-mvp-priority-integrations.md:86` - original MVP explicitly excludes target-country analytics, coupon attribution, and weekly report automation.
  - Pattern:  `.omo/plans/glocalx-design-integration.md:39` - design screen mapping treats target/report/dashboard as `/app` surfaces.
  - Test:     `tests/e2e/auth-flow.spec.ts:21` - dashboard route assertion will need stable behavior after redesign.

  Acceptance criteria (agent-executable only):
  - [ ] Navigation includes Target, Report, and Dashboard as preview/read-only surfaces.
  - [ ] Target screen shows deterministic Japan/Taiwan/USA recommendations and coupon preview only as non-production preview.
  - [ ] Report screen shows weekly summary and route/action to dashboard without claiming scheduler automation.
  - [ ] Dashboard supports weekly/monthly/all-time toggles with deterministic KPI changes.
  - [ ] All preview-only capabilities include restrained Korean copy that avoids production claims.
  - [ ] E2E asserts no horizontal overflow while navigating these surfaces.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Target and report previews navigate correctly
    Tool:     playwright(real Chrome)
    Steps:    npm run e2e -- --project=chromium --grep "target report preview navigation" --reporter=list
    Expected: User opens Target and Report; selected country/report state changes visibly; no production API success is claimed.
    Evidence: .omo/evidence/task-10-target-report.png

  Scenario: Dashboard period toggles update KPIs
    Tool:     playwright(real Chrome)
    Steps:    npm run e2e -- --project=chromium --grep "dashboard period toggles" --reporter=list
    Expected: Week, Month, All toggles change deterministic KPI values and keep scrollWidth <= innerWidth.
    Evidence: .omo/evidence/task-10-dashboard-periods.png
  ```

  Commit: YES | Message: `feat(app): add finalized preview surfaces` | Files: [src/app/app/page.tsx, app preview components, src/fixtures/** if used, tests/e2e/app-preview.spec.ts, component tests]

- [x] 11. Scope-Skipped: Add Admin Debug Surface And Production Readiness Docs

  What to do: Add `/admin` or `/app/admin` behind demo/admin session and `ENABLE_ADMIN_DEBUG=true`. Show integration mode, credential readiness, stores, GBP setup status, post attempts, review sync/reply records, job runs, and audit logs. Update README and `docs/SCOPE.md` to document demo/stub mode, production credential requirements, and deferred prototype scope.
  Must NOT do: Do not expose token values. Do not make admin available when `ENABLE_ADMIN_DEBUG` is unset. Do not imply production GBP verification has happened without live evidence.

  Parallelization: Can parallel: YES | Wave 3 | Blocks: [13] | Blocked by: [6, 7]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/server/db/sqlite.ts:25` - table count queries can support admin summaries.
  - Pattern:  `src/server/db/sqlite.ts:240` - seeded audit log redacts token field.
  - Pattern:  `src/auth/server-session.ts:13` - session helper for protected server pages.
  - Pattern:  `src/auth/session.ts` - demo owner/session constants.
  - Pattern:  `package.json:4` - script list should include readiness command from Task 7.
  - Pattern:  `.omo/plans/glocalx-mvp-priority-integrations.md:535` - original readiness/runbook task.
  - Pattern:  `.omo/plans/glocalx-mvp-priority-integrations.md:605` - original docs/scope task.
  - External: `https://developers.naver.com/docs/serviceapi/search/local/local.md` - Naver credential prerequisites.
  - External: `https://developers.google.com/my-business/reference/rest/` - GBP API access/scope context.

  Acceptance criteria (agent-executable only):
  - [ ] Admin/debug route is 404 or redirects when `ENABLE_ADMIN_DEBUG` is unset.
  - [ ] Admin/debug route requires a valid demo/admin session when enabled.
  - [ ] Admin screen shows readiness by env var name/status only and no token-looking values.
  - [ ] Admin screen lists post/review/job/audit operational state from the database.
  - [ ] README documents local run, demo/stub mode, production credentials, and verification commands.
  - [ ] `docs/SCOPE.md` lists deferred features: Instagram production posting, image/video generation, target-country analytics, coupon attribution, weekly report automation, payments, and multi-store team management.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Admin disabled by default
    Tool:     bash
    Steps:    npm run dev -- --hostname 127.0.0.1 --port 3000 > .omo/evidence/task-11-dev-server.txt 2>&1 & sleep 8; curl -i http://127.0.0.1:3000/admin | tee .omo/evidence/task-11-admin-disabled.txt
    Expected: HTTP 404 or redirect; response body contains no admin operational content.
    Evidence: .omo/evidence/task-11-admin-disabled.txt

  Scenario: Admin shows redacted operational state when enabled
    Tool:     playwright(real Chrome)
    Steps:    ENABLE_ADMIN_DEBUG=true npm run e2e -- --project=chromium --grep "admin redacted operational state" --reporter=list
    Expected: Admin shows integration mode/status/audit records; no OAuth/token-like strings are visible.
    Evidence: .omo/evidence/task-11-admin-redacted.png
  ```

  Commit: YES | Message: `feat(admin): add debug readiness surface` | Files: [src/app/admin/** or src/app/app/admin/**, admin components, README.md, docs/SCOPE.md, tests/e2e/admin.spec.ts, component tests]

- [x] 12. Scoped E2E Evidence Harness

  What to do: Add Playwright helpers/specs that provide seeded login/onboarding shortcuts, mobile/desktop screenshot capture, console-error collection, overflow JSON capture, and trace/evidence naming conventions. Keep existing API E2E specs as contract tests and add UI E2E for the unified flow.
  Must NOT do: Do not rely on human manual testing. Do not make tests order-dependent except where explicitly serial with database reset. Do not store secrets in screenshots or traces.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [13] | Blocked by: [1]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `playwright.config.ts:4` - E2E test directory.
  - Pattern:  `playwright.config.ts:10` - base URL is `http://127.0.0.1:3000`.
  - Pattern:  `playwright.config.ts:11` - configured browser channel is Chrome.
  - Pattern:  `playwright.config.ts:22` - web server command.
  - Pattern:  `tests/e2e/global-setup.ts` - existing DB reset setup.
  - Pattern:  `tests/e2e/auth-flow.spec.ts:3` - auth flow spec pattern.
  - Pattern:  `tests/e2e/post-publish.spec.ts:5` - serial test pattern.
  - Pattern:  `.omo/plans/glocalx-design-integration.md:76` - required mobile/desktop screenshots and overflow JSON.
  - External: `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md` - local Next Playwright docs.

  Acceptance criteria (agent-executable only):
  - [ ] E2E helpers can authenticate and seed onboarding without duplicating fragile UI steps where a test is not about login/onboarding.
  - [ ] E2E helpers save `.png`, `.json`, and `.txt` evidence under `.omo/evidence/`.
  - [ ] A console error collector fails tests on unexpected browser errors.
  - [ ] Overflow helper asserts `document.documentElement.scrollWidth <= window.innerWidth` for `390x900` and `1440x1000`.
  - [ ] Existing `auth-flow`, `onboarding-extraction`, `gbp-setup`, and `post-publish` specs still pass.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Evidence helpers produce desktop and mobile artifacts
    Tool:     playwright(real Chrome)
    Steps:    npm run e2e -- --project=chromium --grep "evidence helpers capture artifacts" --reporter=list
    Expected: Test passes and creates task-12 desktop/mobile screenshots plus overflow JSON.
    Evidence: .omo/evidence/task-12-desktop.png, .omo/evidence/task-12-mobile.png, .omo/evidence/task-12-overflow.json

  Scenario: Unexpected console errors fail the browser run
    Tool:     playwright(real Chrome)
    Steps:    npm run e2e -- --project=chromium --grep "console error guard" --reporter=list
    Expected: Guard test proves console errors are captured and expected allowlist is explicit.
    Evidence: .omo/evidence/task-12-console-guard.txt
  ```

  Commit: YES | Message: `test(e2e): add unified evidence harness` | Files: [tests/e2e/helpers/**, tests/e2e/*.spec.ts, playwright.config.ts if needed]

- [x] 13. Final UX Polish, Regression QA, And Scope Documentation

  What to do: Run complete quality gates, polish mobile/desktop text fit and spacing, verify no horizontal overflow, verify no incoherent UI overlap, update scope docs/release note if needed, verify design assets unchanged, stop any dev servers, and collect final evidence pack.
  Must NOT do: Do not stop at green unit tests without browser screenshots. Do not leave dev servers or browser sessions running. Do not include production claims for preview-only surfaces.

  Parallelization: Can parallel: NO | Wave 4 | Blocks: [final verification] | Blocked by: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `package.json:4` - authoritative scripts: `typecheck`, `lint`, `test`, `build`, `e2e`, `format:check`.
  - Pattern:  `playwright.config.ts:22` - Playwright starts the local Next dev server.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1811` - final visual comparison source for app shell.
  - Pattern:  `02_assets/glocalx-mvp-design/client/src/index.css:45` - final token comparison source.
  - Pattern:  `.omo/plans/glocalx-design-integration.md:465` - prior final verification expectations.
  - Pattern:  `.omo/plans/glocalx-mvp-priority-integrations.md:640` - prior final verification expectations.
  - Test:     `tests/e2e/auth-flow.spec.ts` - route guard regression.
  - Test:     `tests/e2e/post-publish.spec.ts` - post API regression.
  - Test:     new full-flow spec from Tasks 8-12.

  Acceptance criteria (agent-executable only):
  - [ ] `npm run typecheck` exits 0 with output saved to `.omo/evidence/task-13-typecheck.txt`.
  - [ ] `npm run lint` exits 0 with output saved to `.omo/evidence/task-13-lint.txt`.
  - [ ] `npm run test` exits 0 with output saved to `.omo/evidence/task-13-vitest.txt`.
  - [ ] `npm run build` exits 0 with output saved to `.omo/evidence/task-13-build.txt`.
  - [ ] `npm run e2e` exits 0 with output saved to `.omo/evidence/task-13-e2e.txt`.
  - [ ] `.omo/evidence/design-unification-mobile.png`, `.omo/evidence/design-unification-desktop.png`, and `.omo/evidence/design-unification-overflow.json` exist.
  - [ ] `bash -lc 'git diff -- 02_assets/glocalx-mvp-design | tee .omo/evidence/task-13-design-assets-diff.txt'` records no design asset changes.
  - [ ] `bash -lc 'rg -n "wouter|sonner|framer-motion|recharts|tw-animate-css|next-themes" package.json src tests || true'` output is reviewed and only allowed if justified by a task.
  - [ ] `.omo/evidence/task-13-cleanup.txt` records that no QA dev server/tmux/browser process remains.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Full stub-mode happy path through real app
    Tool:     playwright(real Chrome)
    Steps:    npm run e2e -- --project=chromium --grep "full unified stub happy path" --reporter=list
    Expected: Clear cookies -> / -> demo login -> onboarding extraction -> GBP setup -> /app -> post draft/publish or blocked state -> review sync/reply -> target/report/dashboard navigation, with no unexpected console errors.
    Evidence: .omo/evidence/task-13-full-happy-path.txt

  Scenario: Responsive final regression
    Tool:     playwright(real Chrome)
    Steps:    npm run e2e -- --project=chromium --grep "final responsive regression" --reporter=list
    Expected: 390x900 and 1440x1000 screenshots show readable UI, no incoherent overlaps, and overflow JSON passes.
    Evidence: .omo/evidence/design-unification-mobile.png, .omo/evidence/design-unification-desktop.png, .omo/evidence/design-unification-overflow.json
  ```

  Commit: YES | Message: `test(app): verify unified mvp design flow` | Files: [tests/e2e/**, README.md, docs/SCOPE.md, CHANGELOG.md if present, .omo/evidence references if tracked by project policy]

## Final verification wave (MANDATORY - after all implementation tasks)
> Runs in PARALLEL. ALL must APPROVE. Surface results to the caller and wait for an explicit "okay" before declaring complete.
- [x] F1. Plan compliance audit - every task done, every acceptance criterion met
- [x] F2. Code quality review - diagnostics clean, idioms match, no dead code
- [x] F3. Real manual QA - every QA scenario executed with evidence captured
- [x] F4. Scope fidelity - nothing extra shipped beyond Must-Have, nothing Must-NOT-Have introduced

## Commit strategy
- One logical change per commit. Conventional Commits (`<type>(<scope>): <subject>` body + footer).
- Atomic: every commit builds and passes tests on its own.
- No "WIP" / "fix typo squash later" commits on the final branch - clean up before merge.
- Reference the plan file path in the final commit footer: `Plan: .omo/plans/glocalx-dev-design-unification.md`.

## Success criteria
- All Must-Have shipped; all QA scenarios pass with captured evidence; F1-F4 approved; commit history clean.
