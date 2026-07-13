# GlocalX Design System

## 1. Atmosphere & Identity

GlocalX is a warm, mobile-first owner workspace: a pale, tactile app surface contained by a dark, softly lit outer canvas. The signature is an optimistic orange mark and action color, balanced by generous white surfaces and concise Korean copy so onboarding and account tasks feel direct rather than administrative.

## 2. Color

### Palette

| Role                   | Token            | Value     | Usage                                         |
| ---------------------- | ---------------- | --------- | --------------------------------------------- |
| Canvas                 | `--canvas`       | `#0c0b10` | Outer page background                         |
| App surface            | `--phone-bg`     | `#fbf9f6` | Mobile shell background                       |
| Raised surface         | `--card`         | `#ffffff` | Inputs and cards                              |
| Primary text           | `--ink`          | `#191720` | Headlines and primary controls                |
| Secondary text         | `--muted`        | `#938c9c` | Supporting copy                               |
| Divider                | `--line`         | `#ece7ef` | Input and surface borders                     |
| Primary action         | `--accent`       | `#ff6a3d` | Focus, primary action, brand mark             |
| Primary action pressed | `--accent-press` | `#e8542a` | Hover and active primary actions              |
| Soft accent            | `--accent-soft`  | `#fff1ec` | Selected and caution surfaces                 |
| Success                | `--mint`         | `#15bd97` | Completed status                              |
| Provider: Kakao        | `#fee500`        | `#fee500` | Kakao sign-in button only                     |
| Provider: Google       | `#ffffff`        | `#ffffff` | Google sign-in button against `--line` border |

Colors are declared in `src/app/globals.css`; provider colors are intentionally confined to provider actions.

## 3. Typography

| Level          | Size      | Weight  | Line Height | Usage                           |
| -------------- | --------- | ------- | ----------- | ------------------------------- |
| Login headline | 27–28px   | 950     | 1.22–1.25   | Entry and account-page headline |
| Body           | 13.5–14px | 500–700 | 1.55–1.65   | Supporting and input text       |
| Button         | 14.5px    | 800–900 | normal      | Full-width account actions      |
| Label          | 12–13px   | 900–950 | normal      | Form labels                     |
| Fine print     | 11px      | 500–650 | 1.6         | Legal and account links         |

Primary font stack: `Pretendard Variable`, Pretendard, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif. Korean phrases should wrap naturally; avoid headings that leave isolated particles or single syllables.

## 4. Spacing & Layout

The 4px base unit is used throughout. Account screens remain inside `MobileShell`: 24–30px horizontal mobile padding, 10px form rhythm, 14px input/button radii, 34px separation before provider actions, and a 720px maximum entry shell on larger screens. Full-height routes use `100dvh`, never `100vh`.

## 5. Components

### MobileShell

- **Structure:** entry page → `MobileShell` → screen → panel.
- **States:** responsive full-width phone surface on small displays; framed surface from 680px.
- **Accessibility:** semantic `main` and labelled panels.

### ProviderButton

- **Structure:** form → submit button → compact provider mark + label.
- **Variants:** Kakao yellow, Google white/bordered, email dark.
- **States:** default, hover lift, active scale, visible keyboard focus, disabled.
- **Accessibility:** readable provider name in the button label; the decorative mark is hidden from assistive technology.

### CredentialForm

- **Structure:** labelled email/password fields, inline feedback, full-width submit action, a text link to the alternate account path.
- **States:** empty, focused, validation error, provider/configuration error, submitted.
- **Accessibility:** visible labels, `autocomplete` attributes, password inputs, `role="alert"` feedback, and keyboard-submittable forms.

### InlineFeedback

- **Structure:** short message in an accent-soft bordered panel.
- **States:** configuration, validation, and sign-in failure messages.
- **Accessibility:** uses `role="alert"` only for newly surfaced errors.

## 6. Motion & Interaction

Interactive hover and focus changes use the existing 160ms `--ease-out` transitions. Press states use a small transform only. Respect `prefers-reduced-motion`, which already suppresses non-essential animation.

## 7. Depth & Surface

The system uses a mixed strategy: pale tonal shifts establish the app surface, `--line` borders define form controls, and restrained negative-spread shadows lift cards and primary actions. Account forms use the existing white input surface rather than introducing new depth treatments.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- Target WCAG 2.2 AA contrast, visible focus indication, semantic labels, and complete keyboard reachability.
- Authentication errors must explain the next action without exposing credentials or whether a password was correct.
- Password fields use browser autofill semantics and are never echoed in UI or logs.

### Accepted Debt

| Item                                    | Location   | Why accepted                                                                                                        | Owner / Exit                          |
| --------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Provider logos remain typographic marks | Entry page | Existing visual language uses compact text marks; real provider SVG assets can be added after brand-asset approval. | Product / provider-brand asset review |
