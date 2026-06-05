# GlocalX Final Design Integration Plan

## TL;DR
> **Summary**: Integrate the finalized Vite design prototype into the current Next.js App Router MVP by porting its visual system, route-level composition, and interaction narrative into the existing guarded routes and API contracts. Treat the design app as the reference source, not as code to transplant wholesale.
> **Deliverables**:
> - Next-compatible design tokens and global shell using `src/app/globals.css` and `src/app/layout.tsx`.
> - A redesigned `/` login/landing surface that preserves demo-login form behavior.
> - A redesigned `/onboarding` flow that connects to extraction, GBP setup, and onboarding completion timing.
> - A redesigned `/app` workspace with post publish, review, target, report, and dashboard surfaces mapped to existing or explicitly stubbed contracts.
> - Updated Vitest/Playwright coverage and browser QA evidence for mobile and desktop.
> **Effort**: Medium
> **Parallel**: YES - 4 waves
> **Critical Path**: Task 1 -> Task 2 -> Tasks 3/4 -> Tasks 5/6/7 -> Task 8 -> Final Verification

## Context

### Original Request
- Development is already proceeding in parallel.
- Finalized design files are available at `02_assets/glocalx-mvp-design/`.
- Inspect those files and plan how to connect them to the app currently being developed.
- Answer the user in Korean only; keep the rest of the work artifacts in English.

### Interview Summary
- No user interview was needed after repository exploration.
- The request is planning-only through `omo:ulw-plan`; no source implementation is in scope for this turn.
- Default chosen: integrate the design into the actual Next app routes and API contracts, not by embedding the standalone Vite SPA.

### Metis Review (gaps addressed)
- Do not transplant Wouter/Vite routing or the whole SPA state tree; keep Next App Router server guards authoritative.
- Re-read current files before editing because parallel untracked work exists under `src/posts/`, `src/app/api/posts/`, `tests/e2e/post-publish.spec.ts`, and design assets.
- Treat Instagram interactions as placeholder/display-only unless backend contracts are explicitly added.
- Require concrete visual QA evidence, role/text assertions, and no horizontal overflow checks.
- Split the large prototype into small typed modules; no implementation file should exceed the 250 pure LOC ceiling.
- Avoid dependency sprawl; do not add Wouter, Radix, shadcn, sonner, Recharts, Framer Motion, or next-themes unless a later explicit implementation task proves the need.
- Follow Next 16 docs: async `cookies()`, async route params, App Router route handlers, global CSS in root layout, and server/client component boundaries.
- Update Playwright tests before changing selector/copy anchors.
- Keep `02_assets/glocalx-mvp-design` immutable as the finalized reference.

### Screen Mapping
| Design prototype screen | Main app target | Integration decision |
| --- | --- | --- |
| `login` | `/` via `src/app/page.tsx` | Replace scaffold visuals while preserving `POST /api/auth/demo-login`. |
| `onboard` | `/onboarding` via `src/app/onboarding/page.tsx` | Connect to extraction, GBP setup, and completion route; keep server guard. |
| `asset` | `/app` posting step | Render as preparation/status cards; no real asset-generation backend claim. |
| `post` | `/app` posting step | Connect GBP draft/publish to existing or parallel post API routes. |
| `review` | `/app` review step | Stub/read-only unless explicit review routes are added with tests. |
| `target` | `/app` target step | Deterministic recommendation preview; no production analytics claim. |
| `report` | `/app` report step | Deterministic weekly report preview; no scheduler automation claim unless backend route is added. |
| `dashboard` | `/app` dashboard step | Deterministic KPI dashboard using local fixture data and period toggles. |

### Provider and Dependency Decisions
- Do not introduce Wouter; App Router remains the only routing layer.
- Do not introduce the design app's `ThemeProvider`; use root CSS variables and `src/app/layout.tsx`.
- Do not introduce `TooltipProvider`, Radix, shadcn wrappers, `sonner`, Recharts, Framer Motion, or `tw-animate-css` for this integration.
- Use focused semantic React components and CSS/Tailwind first.
- If a later implementation requires a provider or dependency, it must be introduced in a separate RED->GREEN task with an explicit package-level acceptance criterion and no hidden transitive UI rewrite.

## Work Objectives

### Core Objective
Make the currently developed Next.js MVP look and behave like the finalized GlocalX design while preserving the app's real routing, session, validation, database, and stub/production integration seams.

### Deliverables
- English implementation handoff plan.
- File-by-file integration map from design assets to Next app surfaces.
- Dependency and scope decisions.
- TDD and QA instructions per task.
- Final verification wave with zero human intervention.

### Definition of Done (verifiable conditions with commands)
- `npm run typecheck` exits 0.
- `npm run lint` exits 0.
- `npm run test` exits 0.
- `npm run build` exits 0.
- `npm run e2e` exits 0.
- Browser QA captures:
  - `.omo/evidence/design-integration-mobile.png` from `http://127.0.0.1:3000` at `390x900`.
  - `.omo/evidence/design-integration-desktop.png` from `http://127.0.0.1:3000` at `1440x1000`.
  - `.omo/evidence/design-integration-overflow.json` proving `document.documentElement.scrollWidth <= window.innerWidth` on mobile and desktop.
- Stub-mode user path works through the real app surface:
  1. Visit `/`.
  2. Start demo login through the redesigned login action.
  3. Land on `/onboarding`.
  4. Submit `https://naver.me/mybrunchcafe`.
  5. See extracted `브런치모먼트 홍대점` result and missing-hours prompt.
  6. Trigger Google/GBP setup UI.
  7. Complete onboarding and land on `/app`.
  8. Create a GBP post draft with `주말 브런치 신메뉴 홍보`.
  9. Publish or see the verified-location blocking message from the real post API.
  10. Navigate review, target, report, and dashboard surfaces as stub/read-only screens.

### Must Have
- Preserve server-side route guards in `src/app/onboarding/page.tsx` and `src/app/app/page.tsx`.
- Preserve the demo-cookie flow from `src/auth/session.ts`, `src/auth/server-session.ts`, `src/app/api/auth/demo-login/route.ts`, and `src/app/api/onboarding/complete/route.ts`.
- Use `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx` as interaction/copy reference and `02_assets/glocalx-mvp-design/client/src/index.css` as token/reference CSS.
- Keep `02_assets/glocalx-mvp-design/` unchanged.
- Keep Korean UI copy user-facing.
- Keep implementation files typed, focused, and below 250 pure LOC.
- Add tests before production changes.
- For every visual task, capture browser evidence after tests pass.
- Use the existing route-handler validation pattern from `src/app/api/onboarding/extractions/route.ts` and `src/app/api/gbp/setup/route.ts`.
- Use existing post routes if present; if parallel work removes them before implementation, recreate route handlers from `src/posts/post-flow.ts` using the same schema and API tests.

### Must NOT Have
- No wholesale copy of `Home.tsx` into one giant client component.
- No Wouter in the Next app.
- No mutation of finalized design assets.
- No replacing server redirects with client-only navigation for protected pages.
- No Instagram production posting claim.
- No real auth expansion to Kakao/email; the redesigned login UI must still submit the demo-login form unless a future auth plan changes that.
- No hidden dependency additions for Radix/shadcn/sonner/Recharts/Framer/next-themes.
- No weakening or deleting existing tests to match the new visual copy.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: TDD with Vitest for unit/component contracts and Playwright for route/user-flow e2e.
- QA policy: Every implementation task has at least one real browser scenario plus one failure/edge scenario.
- Evidence: `.omo/evidence/task-{N}-{slug}.{txt|json|png}`.
- Manual QA channel: Browser use via Playwright or the in-app Browser plugin against the running Next app.
- Baseline checks: before implementation, capture current failing/passing state for the specific tests being changed; after implementation, capture green output.

## Execution Strategy

### Parallel Execution Waves
Wave 1: Task 1
Wave 2: Tasks 2, 3, 4
Wave 3: Tasks 5, 6, 7
Wave 4: Task 8

### Dependency Matrix (full, all tasks)
- Task 1 blocks every implementation task.
- Task 2 blocks Tasks 3, 4, 5, 6, 7, and 8.
- Task 3 blocks final auth-flow and landing QA in Task 8.
- Task 4 blocks onboarding QA and the `/app` route entry in Tasks 5 and 8.
- Task 5 depends on Tasks 2 and 4; it blocks post-flow QA in Task 8.
- Task 6 depends on Task 2 and can run after the app shell exists.
- Task 7 depends on Task 2 and can run after the app shell exists.
- Task 8 depends on all earlier tasks.

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: References + Acceptance Criteria + QA Scenarios.

- [ ] 1. Preflight Reconciliation and Test Baseline

  **What to do**: Before editing, capture the current parallel-development state, read every target file fresh, and establish baseline test results for the surfaces that will change. Record which post routes exist at execution time. Read relevant Next docs again before any code edits.
  **Must NOT do**: Do not revert, stage, delete, or normalize unrelated parallel changes. Do not edit source in this task except tests needed to capture the first RED state for the next task.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: all tasks | Blocked By: none

  **References**:
  - Dirty worktree observed: `next-env.d.ts`, `src/domain/schemas.ts`, `src/integrations/stub.ts`, `02_assets/`, `src/posts/`, `src/app/api/posts/`, `tests/e2e/post-publish.spec.ts`.
  - Existing plan context: `.omo/plans/glocalx-mvp-priority-integrations.md`.
  - Next docs to read before code: `node_modules/next/dist/docs/01-app/02-guides/migrating/from-vite.md`, `01-app/01-getting-started/05-server-and-client-components.md`, `01-app/01-getting-started/15-route-handlers.md`, `01-app/01-getting-started/11-css.md`, `01-app/02-guides/forms.md`, `01-app/03-api-reference/04-functions/cookies.md`, `01-app/03-api-reference/04-functions/redirect.md`.
  - Current Playwright config: `playwright.config.ts`.
  - Current Vitest config: `vitest.config.ts`.

  **Acceptance Criteria**:
  - [ ] `.omo/evidence/task-1-git-status.txt` contains `git status --short`.
  - [ ] `.omo/evidence/task-1-target-files.txt` lists all target files that exist at execution time.
  - [ ] `.omo/evidence/task-1-test-baseline.txt` records results for `npm run typecheck`, `npm run test`, and the relevant Playwright specs before production edits.
  - [ ] Executor confirms whether `src/app/api/posts/drafts/route.ts` and `src/app/api/posts/[draftId]/publish/route.ts` exist before Task 5 starts.

  **QA Scenarios**:
  ```text
  Scenario: Baseline route shell is reachable
    Tool: Playwright
    Steps: page.goto("/"); assert heading or product mark containing "GlocalX" is visible.
    Expected: page loads without console errors before edits; current visual state recorded.
    Evidence: .omo/evidence/task-1-baseline-home.png

  Scenario: Baseline protected route behavior
    Tool: Playwright
    Steps: clear cookies; page.goto("/app"); assert final URL is "/" and landing shell is visible.
    Expected: unauthenticated users are redirected to login.
    Evidence: .omo/evidence/task-1-baseline-auth.txt
  ```

  **Commit**: NO | Message: n/a | Files: evidence only

- [ ] 2. Port Design Tokens and Shared Visual Shell

  **What to do**: Update the main app's global CSS and layout metadata to reflect the finalized design system: dark canvas, accent orange, mint/blue support colors, phone/card tokens, body font stack, no horizontal overflow, and responsive base constraints. Preserve Tailwind import and Next root layout rules. Add or update tests that assert the root shell and token names exist.
  **Must NOT do**: Do not paste the entire design `index.css`. Do not import `tw-animate-css`. Do not mutate the design asset CSS.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: Tasks 3, 4, 5, 6, 7, 8 | Blocked By: Task 1

  **References**:
  - Current global CSS: `src/app/globals.css:1`.
  - Current layout metadata: `src/app/layout.tsx:1`.
  - Design tokens: `02_assets/glocalx-mvp-design/client/src/index.css:45`.
  - Design board/layout primitives: `02_assets/glocalx-mvp-design/client/src/index.css:85`.
  - Next CSS docs: `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`.

  **Acceptance Criteria**:
  - [ ] `src/app/globals.css` contains the selected design variables: `--ink`, `--ink-soft`, `--line`, `--canvas`, `--canvas-2`, `--accent`, `--accent-press`, `--accent-soft`, `--mint`, `--mint-soft`, `--blue`, `--phone-bg`, `--card`, `--shadow`, and `--r`.
  - [ ] `src/app/globals.css` keeps `@import "tailwindcss";` as the first statement.
  - [ ] `src/app/layout.tsx` keeps `<html lang="ko">` and imports `./globals.css`.
  - [ ] Mobile body has no horizontal overflow at `390x900`.
  - [ ] `npm run typecheck`, `npm run lint`, and the new/updated style contract test pass.

  **QA Scenarios**:
  ```text
  Scenario: Desktop shell uses finalized dark design canvas
    Tool: Playwright
    Steps: page.setViewportSize({ width: 1440, height: 1000 }); page.goto("/"); capture screenshot.
    Expected: body background is dark canvas and no old pale green scaffold dominates.
    Evidence: .omo/evidence/task-2-desktop-shell.png

  Scenario: Mobile shell has no horizontal overflow
    Tool: Playwright
    Steps: page.setViewportSize({ width: 390, height: 900 }); page.goto("/"); evaluate documentElement scrollWidth and innerWidth.
    Expected: scrollWidth <= innerWidth.
    Evidence: .omo/evidence/task-2-mobile-overflow.json
  ```

  **Commit**: YES | Message: `feat(ui): port finalized design tokens` | Files: `src/app/globals.css`, `src/app/layout.tsx`, relevant tests

- [ ] 3. Redesign `/` Login Landing Around Real Demo Auth

  **What to do**: Replace the current scaffold card in `src/app/page.tsx` with the finalized login/landing composition from the design asset, but keep real form submission to `/api/auth/demo-login`. Keep only one functional primary action for demo auth. Render Kakao/email/secondary options as disabled or "coming soon" affordances only if needed for visual fidelity. Update shared copy in `src/lib/app-shell.ts` or replace it with a typed landing copy module.
  **Must NOT do**: Do not add real Kakao/email auth. Do not navigate with local React state. Do not use design-app `toast.success`.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: Task 8 | Blocked By: Tasks 1, 2

  **References**:
  - Current landing route: `src/app/page.tsx:1`.
  - Current demo-login form: `src/app/page.tsx:55`.
  - Current landing copy: `src/lib/app-shell.ts:9`.
  - Demo login route: `src/app/api/auth/demo-login/route.ts:14`.
  - Design login screen: `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:653`.
  - Existing auth e2e anchors: `tests/e2e/auth-flow.spec.ts:3`, `tests/e2e/app-boot.spec.ts:3`.

  **Acceptance Criteria**:
  - [ ] A failing Playwright test is written first for the redesigned primary login action and updated visible copy.
  - [ ] `/` renders the design-inspired brand mark, headline, supporting text, and primary demo-login CTA.
  - [ ] The primary CTA submits `POST /api/auth/demo-login` and redirects to `/onboarding` for first-time users.
  - [ ] Existing unauthenticated `/app` redirect behavior remains green.
  - [ ] Old test assertions are updated by behavior, not simply by brittle exact old copy.

  **QA Scenarios**:
  ```text
  Scenario: First-time demo login starts onboarding
    Tool: Playwright
    Steps: clear cookies; page.goto("/"); click the primary demo-login button; wait for URL /onboarding.
    Expected: URL matches /onboarding and onboarding heading/prompt is visible.
    Evidence: .omo/evidence/task-3-demo-login.txt

  Scenario: Disabled auth alternatives do not fake success
    Tool: Playwright
    Steps: page.goto("/"); click any disabled/coming-soon Kakao or email visual option if rendered.
    Expected: user remains on "/" and sees an accessible disabled/coming-soon state; no demo session cookie is set by that option.
    Evidence: .omo/evidence/task-3-auth-placeholder.txt
  ```

  **Commit**: YES | Message: `feat(ui): redesign landing login surface` | Files: `src/app/page.tsx`, `src/lib/app-shell.ts` or replacement copy module, `tests/e2e/auth-flow.spec.ts`, `tests/e2e/app-boot.spec.ts`, relevant component tests

- [ ] 4. Build Next-Compatible App Shell and Client Flow Primitives

  **What to do**: Extract reusable UI primitives inspired by the design app: stage shell, step navigation, phone frame or mobile content frame, chat message list, chip actions, status cards, and KPI cards. Put client-only interactivity behind focused `"use client"` files. Keep server pages as wrappers where session guards exist.
  **Must NOT do**: Do not copy the 1,800-line `Home.tsx` into `src/`. Do not create any file over 250 pure LOC. Do not add Wouter or `ThemeProvider`.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: Tasks 5, 6, 7, 8 | Blocked By: Tasks 1, 2

  **References**:
  - Design screen config/state: `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:12`.
  - Design screen loader/state reset: `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:103`.
  - Design outer stage/nav/phone shell: `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:1811`.
  - Next Server/Client docs: `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`.
  - Programming skill guardrail: TypeScript strictness, TDD, and 250 pure LOC ceiling.

  **Acceptance Criteria**:
  - [ ] New primitives are split by responsibility, for example `src/app/_components/design-shell.tsx`, `step-nav.tsx`, `phone-frame.tsx`, `chat-message.tsx`, `action-chip.tsx`, and `metric-card.tsx` or equivalent focused names.
  - [ ] Client-only files have `"use client"` and only import client-safe modules.
  - [ ] Server pages can render the shell without importing browser-only hooks directly.
  - [ ] Component tests cover active step rendering, disabled actions, and chat message rendering.
  - [ ] No new implementation file exceeds 250 pure LOC.

  **QA Scenarios**:
  ```text
  Scenario: Step navigation is keyboard reachable
    Tool: Playwright
    Steps: page.goto("/app") with authenticated/onboarded cookies; Tab through step navigation; activate a step with Enter.
    Expected: focus is visible and active step changes without page reload.
    Evidence: .omo/evidence/task-4-step-nav-keyboard.txt

  Scenario: Shell remains usable on mobile
    Tool: Playwright
    Steps: page.setViewportSize({ width: 390, height: 900 }); navigate to /app; capture screenshot.
    Expected: step navigation is horizontally scrollable or stacked and content is not clipped.
    Evidence: .omo/evidence/task-4-mobile-shell.png
  ```

  **Commit**: YES | Message: `feat(ui): add design shell primitives` | Files: `src/app/_components/**` or equivalent, component tests, `src/app/globals.css`

- [ ] 5. Connect Onboarding UI to Extraction, GBP Setup, and Completion

  **What to do**: Redesign `/onboarding` using the finalized Step 1 narrative, but wire the flow to real route handlers: submit owner input to `/api/onboarding/extractions`, render candidates or manual-input fallback, collect missing hours when returned, call `/api/gbp/setup` for Google/GBP setup in stub mode, then call `/api/onboarding/complete` only after the onboarding UI has shown the accepted business profile and GBP setup outcome. Keep server-side session redirects.
  **Must NOT do**: Do not mark onboarding complete before extraction and setup states are visible. Do not claim live GBP verification if the API returns `VERIFICATION_PENDING` or `CLAIM_REQUIRED`.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: Task 8 | Blocked By: Tasks 1, 2, 4

  **References**:
  - Current onboarding page guard/form: `src/app/onboarding/page.tsx:5`.
  - Onboarding completion route: `src/app/api/onboarding/complete/route.ts:11`.
  - Extraction route: `src/app/api/onboarding/extractions/route.ts:71`.
  - GBP setup route: `src/app/api/gbp/setup/route.ts:34`.
  - Extraction schema: `src/domain/schemas.ts:5`.
  - GBP schema: `src/domain/schemas.ts:26`.
  - Design onboarding initializer: `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:143`.
  - Design onboarding interactions: `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:332`.
  - Review note error-state gap: `02_assets/glocalx-mvp-design/REVIEW_NOTES.md:13`.

  **Acceptance Criteria**:
  - [ ] Tests are written RED first for Naver success, Naver no-result fallback, malformed input, GBP setup pending, and completion timing.
  - [ ] `/onboarding` remains inaccessible without demo cookies.
  - [ ] Submitting `https://naver.me/mybrunchcafe` renders `브런치모먼트 홍대점`, missing `hours`, and a friendly Korean prompt.
  - [ ] Submitting `없는가게zzzz` renders manual-input fallback from the API response.
  - [ ] GBP setup renders returned status and follow-up/audit ids in owner-friendly copy, without exposing internal secrets.
  - [ ] `/api/onboarding/complete` is invoked only after the user confirms the visible setup flow.

  **QA Scenarios**:
  ```text
  Scenario: Successful onboarding extraction and GBP setup
    Tool: Playwright
    Steps: clear cookies; login from "/"; fill onboarding input "https://naver.me/mybrunchcafe"; submit; confirm candidate; trigger GBP setup; complete onboarding.
    Expected: candidate name is visible, setup status is visible, final URL is /app.
    Evidence: .omo/evidence/task-5-onboarding-success.png

  Scenario: No Naver result falls back to manual entry
    Tool: Playwright
    Steps: login from "/"; fill onboarding input "없는가게zzzz"; submit.
    Expected: manual-entry message from API is visible and user stays on /onboarding.
    Evidence: .omo/evidence/task-5-onboarding-fallback.png
  ```

  **Commit**: YES | Message: `feat(onboarding): connect finalized setup flow` | Files: `src/app/onboarding/page.tsx`, onboarding client components/actions, API tests if needed, `tests/e2e/onboarding-extraction.spec.ts`, `tests/e2e/auth-flow.spec.ts`

- [ ] 6. Connect Post Draft and Publish UI on `/app`

  **What to do**: Implement the finalized Step 2/3 post creation surface inside `/app`: owner intent input, asset-enhancement status cards as UI-only/stub cards, GBP draft preview from `/api/posts/drafts`, revision affordance if the backend route supports it, publish action to `/api/posts/[draftId]/publish`, and blocking/error display for unverified GBP locations. Use existing post routes and `src/posts/post-flow.ts` if present; otherwise create the missing route handlers exactly to satisfy the existing post e2e contract.
  **Must NOT do**: Do not present Instagram publish as real. Do not hide `LOCATION_NOT_VERIFIED`. Do not publish with a fabricated success if the API returns 409.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: Task 8 | Blocked By: Tasks 1, 2, 4

  **References**:
  - Current app route guard: `src/app/app/page.tsx:5`.
  - Post request schemas: `src/domain/schemas.ts:33`.
  - Parallel post domain: `src/posts/post-flow.ts:241`.
  - Parallel draft route: `src/app/api/posts/drafts/route.ts:34`.
  - Parallel publish route: `src/app/api/posts/[draftId]/publish/route.ts:40`.
  - Post API e2e: `tests/e2e/post-publish.spec.ts:3`.
  - Design asset flow: `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:158`, `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:273`.
  - Review note reservation-publish decision: `02_assets/glocalx-mvp-design/REVIEW_NOTES.md:54`.

  **Acceptance Criteria**:
  - [ ] RED tests cover draft success, publish success, and unverified-location blocking from the UI.
  - [ ] `/app` displays post intent input and at least the design's intent/image/form-factor preparation cards.
  - [ ] Draft preview text is populated from `/api/posts/drafts`, not hardcoded in the component after API integration.
  - [ ] Publish status comes from `/api/posts/[draftId]/publish`.
  - [ ] Instagram controls, if visible, are labeled as coming soon or preview-only.
  - [ ] Existing `tests/e2e/post-publish.spec.ts` passes.

  **QA Scenarios**:
  ```text
  Scenario: GBP draft preview appears from API
    Tool: Playwright
    Steps: authenticate/onboard; page.goto("/app"); select posting step; enter "주말 브런치 신메뉴 홍보"; click draft button.
    Expected: UI shows "브런치모먼트 홍대점에서 주말 브런치 신메뉴 홍보 소식을 전해드립니다." from the API response.
    Evidence: .omo/evidence/task-6-post-draft.png

  Scenario: Publish blocked state is visible
    Tool: Playwright
    Steps: force or create VERIFICATION_PENDING state through the existing setup flow; create draft; click publish.
    Expected: UI shows the Korean `LOCATION_NOT_VERIFIED` recovery message and does not show success.
    Evidence: .omo/evidence/task-6-post-blocked.png
  ```

  **Commit**: YES | Message: `feat(posts): connect dashboard publishing flow` | Files: `src/app/app/page.tsx`, post client components/actions, `src/app/api/posts/**` if missing, `tests/e2e/post-publish.spec.ts`, app e2e tests

- [ ] 7. Add Review, Target, Report, and Dashboard Surfaces as Explicit Stub/Read-Only Views

  **What to do**: Port the finalized Step 4, Step 5, Step 6, and `6+` dashboard visuals into `/app` as navigable surfaces using deterministic stub data. Review cards may call existing stub review adapters only if backend routes are added in this task with tests; otherwise keep them read-only. Target-country and report views must be labeled in product copy as analysis/recommendation previews, not production automation.
  **Must NOT do**: Do not create fake production behavior for malicious-review detection, weekly scheduler automation, coupon attribution, or country recommendation APIs if backend contracts do not exist.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: Task 8 | Blocked By: Tasks 1, 2, 4

  **References**:
  - Current app dashboard placeholder: `src/app/app/page.tsx:16`.
  - Stub reviews adapter: `src/integrations/stub.ts:126`.
  - Stub scheduler adapter: `src/integrations/stub.ts:183`.
  - Design review initializer: `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:289`.
  - Design target initializer: `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:303`.
  - Design report initializer: `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:318`.
  - Design dashboard render: `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx:712`.
  - Review-note backend gaps: `02_assets/glocalx-mvp-design/REVIEW_NOTES.md:59`, `02_assets/glocalx-mvp-design/REVIEW_NOTES.md:64`, `02_assets/glocalx-mvp-design/REVIEW_NOTES.md:69`.

  **Acceptance Criteria**:
  - [ ] RED tests cover navigation to review, target, report, and dashboard surfaces.
  - [ ] Review screen shows tone choices and malicious-review warning as stub/read-only unless a tested backend route is added.
  - [ ] Target screen shows deterministic Japan/Taiwan/USA recommendations and coupon preview as stub data.
  - [ ] Report screen shows weekly summary and a route/action to the dashboard.
  - [ ] Dashboard supports weekly/monthly/all-time period toggles with deterministic KPI changes.
  - [ ] All preview-only capabilities are disclosed in UI copy without overpromising production automation.

  **QA Scenarios**:
  ```text
  Scenario: Review and target preview surfaces navigate correctly
    Tool: Playwright
    Steps: authenticate/onboard; page.goto("/app"); open Review step; choose each tone; open Target step; choose Japan.
    Expected: selected tone/country states are visibly reflected; no production API success is claimed.
    Evidence: .omo/evidence/task-7-review-target.png

  Scenario: Report dashboard period toggles update KPIs
    Tool: Playwright
    Steps: authenticate/onboard; page.goto("/app"); open Report; click Dashboard; click Week, Month, All.
    Expected: KPI values change deterministically and no horizontal overflow occurs.
    Evidence: .omo/evidence/task-7-dashboard-periods.png
  ```

  **Commit**: YES | Message: `feat(app): add finalized preview surfaces` | Files: `src/app/app/page.tsx`, app client components, deterministic fixture modules, e2e/component tests

- [ ] 8. Final Visual Polish, Regression QA, and Evidence Pack

  **What to do**: Run the complete quality gate, complete browser QA on mobile and desktop, verify accessibility basics, verify no horizontal overflow, verify no source file exceeds 250 pure LOC, and document evidence. Clean up dev servers, browser sessions, and temporary QA artifacts that are not intended as evidence.
  **Must NOT do**: Do not stop at green tests without real browser evidence. Do not leave QA servers or browser contexts running.

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: final completion | Blocked By: Tasks 1-7

  **References**:
  - Full command set from `package.json`.
  - Playwright webServer: `playwright.config.ts`.
  - Browser QA policy from this plan.
  - Design source to compare against: `02_assets/glocalx-mvp-design/client/src/pages/Home.tsx`, `02_assets/glocalx-mvp-design/client/src/index.css`.

  **Acceptance Criteria**:
  - [ ] `npm run typecheck` exits 0.
  - [ ] `npm run lint` exits 0.
  - [ ] `npm run test` exits 0.
  - [ ] `npm run build` exits 0.
  - [ ] `npm run e2e` exits 0.
  - [ ] Mobile screenshot saved to `.omo/evidence/design-integration-mobile.png`.
  - [ ] Desktop screenshot saved to `.omo/evidence/design-integration-desktop.png`.
  - [ ] Overflow JSON saved to `.omo/evidence/design-integration-overflow.json`.
  - [ ] `git status --short` after implementation contains only expected changed files.
  - [ ] QA cleanup receipt saved to `.omo/evidence/design-integration-cleanup.txt`.

  **QA Scenarios**:
  ```text
  Scenario: Full happy path through real app surface
    Tool: Playwright
    Steps: clear cookies; page.goto("/"); click primary demo login; complete onboarding with "https://naver.me/mybrunchcafe"; finish GBP setup; land on /app; create post draft; attempt publish; navigate review, target, report, dashboard.
    Expected: every step reaches its expected visible state with no console errors.
    Evidence: .omo/evidence/task-8-full-happy-path.txt

  Scenario: Responsive regression check
    Tool: Playwright
    Steps: run the full surface smoke at 390x900 and 1440x1000; capture screenshots and overflow JSON.
    Expected: no unreadable clipping, no incoherent overlaps, and no horizontal overflow.
    Evidence: .omo/evidence/design-integration-mobile.png, .omo/evidence/design-integration-desktop.png, .omo/evidence/design-integration-overflow.json
  ```

  **Commit**: YES | Message: `test(ui): verify finalized design integration` | Files: tests, evidence references if tracked by project policy, docs/update note if needed

## Final Verification Wave (MANDATORY - after ALL implementation tasks)
> ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
- [ ] F1. Plan Compliance Audit
  - Verify every TODO acceptance criterion is checked or explicitly marked blocked with evidence.
  - Command: `rg -n "DECISION NEEDED|TODO|FIXME|as any|@ts-ignore|@ts-expect-error" src tests`
  - Expected: no unapproved placeholders or unsafe TypeScript suppressions.
- [ ] F2. Code Quality Review
  - Command: `npm run typecheck && npm run lint && npm run test && npm run build`
  - Expected: all exit 0.
- [ ] F3. Real Manual QA
  - Command: `npm run e2e`
  - Browser scenario: run the full happy path and responsive screenshots described in Task 8.
  - Expected: e2e exits 0, screenshots and overflow JSON exist.
- [ ] F4. Scope Fidelity Check
  - Verify `02_assets/glocalx-mvp-design/` is unchanged.
  - Verify no Wouter/Vite runtime code was added to the main app.
  - Verify Instagram/review/target/report unimplemented backend capabilities are not presented as production-ready.
- [ ] F5. Cleanup Receipt
  - Verify no QA dev server, tmux session, or browser context remains from the manual QA run.
  - Evidence: `.omo/evidence/design-integration-cleanup.txt`.

## Commit Strategy
- Default: do not auto-commit unless the user authorizes it.
- Use one conventional commit per task after that task passes its tests and QA.
- Suggested final commit order:
  1. `feat(ui): port finalized design tokens`
  2. `feat(ui): redesign landing login surface`
  3. `feat(ui): add design shell primitives`
  4. `feat(onboarding): connect finalized setup flow`
  5. `feat(posts): connect dashboard publishing flow`
  6. `feat(app): add finalized preview surfaces`
  7. `test(ui): verify finalized design integration`
- If committing with this plan, include footer: `Plan: .omo/plans/glocalx-design-integration.md`.

## Success Criteria
- The finalized design is visibly connected to the developed Next app through actual routes, not a separate SPA.
- Existing session and route protection behavior survives.
- Existing API surfaces are used before new backend contracts are added.
- Design reference files remain unchanged.
- All tests, build, and browser QA pass with captured evidence.
- Parallel development changes are preserved and integrated rather than reverted.
