# Visual QA Report - 127.0.0.1:3000

Status: DONE_WITH_CONCERNS
Date: 2026-06-09
Target: http://127.0.0.1:3000
Mode: Visual QA, report-only
Framework: Next.js
Screenshots: 14
Evidence JSON: captured locally during QA; screenshot evidence is committed below

## Health Score

Overall: 92/100

| Category           | Score | Notes                                                       |
| ------------------ | ----: | ----------------------------------------------------------- |
| Console            |    70 | 2 console resource errors observed                          |
| Links / navigation |   100 | Tested primary app nav and onboarding handoff               |
| Visual             |    92 | One visible nav-state mismatch                              |
| Functional         |   100 | Core tested flows completed                                 |
| UX                 |    84 | Nav highlight mismatch and long onboarding completion state |
| Performance        |   100 | No slow visual states observed in this pass                 |
| Content            |   100 | Korean copy was readable and fit containers                 |
| Accessibility      |   100 | Active tab aria state updated correctly in DOM              |

## Coverage

Visited and captured:

- Login / entry screen
- Naver store input
- Naver candidate and editable confirmation fields
- GBP setup pending state
- App posting workspace
- GBP performance home summary
- GBP performance detail tab
- Draft ready state
- Publish blocked state
- Mobile login, posting, home, and performance views

## Findings

### ISSUE-001 - Bottom nav visual active state does not follow selected tab

Severity: Medium
Category: Visual / UX
Evidence:

- screenshots/desktop-08-app-insights.png
- screenshots/mobile-04-app-insights.png

What happened:
The app content switches to `GBP 성과 자세히` after selecting `성과`, but the visible active pill remains on `포스팅`. A DOM check confirmed `성과` has `aria-current="page"`, so the app state and accessibility state are correct while the visual highlight is stale.

User impact:
Users can land on the right screen but the nav tells them they are still on a different tab.

Repro:

1. Complete onboarding and enter `/app`.
2. Click `성과`.
3. Confirm the page heading changes to `GBP 성과 자세히`.
4. Observe the bottom nav still visually highlights `포스팅`.

### ISSUE-002 - Console shows resource errors during normal flow

Severity: Low
Category: Console
Evidence:

- local visual QA evidence JSON

Observed console entries:

- `Failed to load resource: the server responded with a status of 404 (Not Found)` on the entry page.
- `Failed to load resource: the server responded with a status of 409 (Conflict)` after attempting GBP publish.

What happened:
The 409 corresponds to the expected unverified-GBP publish block and the UI renders the correct Korean warning. The 404 did not reproduce as an app-level bad response in the captured network list, but it still appears in the browser console.

User impact:
No visible user-facing failure was observed, but the console is not clean.

Repro:

1. Open `/`.
2. Continue through onboarding to `/app`.
3. Generate a GBP draft.
4. Click `GBP 게시하기`.
5. Check console errors.

### ISSUE-003 - GBP pending handoff is visually long and easy to miss

Severity: Low
Category: UX
Evidence:

- screenshots/desktop-05-gbp-pending.png

What happened:
The onboarding chat retains the prior extraction, confirmation, setup, status, audit, follow-up, and dashboard CTA in one long vertical stream. The full page measured 1930px tall on a 1000px desktop viewport.

User impact:
The `대시보드로 이동` CTA can sit far below earlier context, so a user may need to scroll and scan more than expected after GBP setup completes.

Repro:

1. Complete Naver extraction.
2. Confirm the store profile.
3. Click `다음: GBP 세팅 확인`.
4. Observe the full pending handoff stream and the lower dashboard CTA.

## Passes

- No horizontal overflow found on any captured desktop or mobile screen.
- App tab content loads without the previous `Failed to fetch` card.
- GBP performance endpoint rendered metrics on desktop and mobile.
- Draft generation rendered a ready card with no layout break.
- Publish-blocked state rendered a Korean warning and did not falsely show success.
- Mobile 390x900 screenshots kept controls visible within the viewport.

## Console / Network Summary

Bad responses captured:

- 409 `POST /api/posts/.../publish`, expected for unverified GBP publish block.

Console errors captured:

- One generic 404 resource error on `/`.
- One 409 resource error after the expected publish block.

## Screenshot Index

- screenshots/desktop-01-login.png
- screenshots/desktop-02-onboarding-input.png
- screenshots/desktop-03-onboarding-candidate.png
- screenshots/desktop-04-onboarding-confirmed.png
- screenshots/desktop-05-gbp-pending.png
- screenshots/desktop-06-app-post.png
- screenshots/desktop-07-app-home.png
- screenshots/desktop-08-app-insights.png
- screenshots/desktop-09-app-draft-ready.png
- screenshots/desktop-10-app-publish-state.png
- screenshots/mobile-01-login.png
- screenshots/mobile-02-app-post.png
- screenshots/mobile-03-app-home.png
- screenshots/mobile-04-app-insights.png
