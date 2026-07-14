# GlocalX MVP

GlocalX is a mobile-first owner assistant for Naver business extraction and Google Business Profile operations. This scaffold starts with a credential-free stub mode and leaves production integrations behind explicit adapter boundaries.

## Engineering Review

Use `docs/engineering-review-readiness.md` as the detailed reviewer guide for
architecture, data flow, environment setup, integration boundaries, tests, known
risks, and evidence. Current visual QA is summarized in
`docs/qa/store-retrieval-gbp-setup/visual-qa-report.md`.

## Commands

```bash
npm run dev
npm run typecheck
npm run lint
npm run test
npm run build
npm run e2e
npm run format:check
```

For local verification, install dependencies with `npm ci` when needed, keep
`APP_INTEGRATION_MODE=stub`, then run the relevant checks above. A full reviewer
pass should include `npm run typecheck`, `npm run lint`, `npm run test`,
`npm run build`, `npm run e2e`, and `npm run format:check`.

## Local App

Run the app at `http://127.0.0.1:3000`.

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

## Environment

Copy `.env.example` to `.env.local` and keep real credentials out of git. Stub mode is the default until Naver Developers and Google Business Profile credentials are available.

For feature worktrees, use an isolated SQLite path and dev port in the ignored
`.env.local` file, for example a worktree-specific path under `/tmp`. This keeps
local registrations, sessions, and test data out of another checkout's database.

Local development and tests may use the default SQLite fallback:

```bash
DATABASE_PROVIDER=sqlite
GLOCALX_DB_PATH=.glocalx/dev.db
```

Production-like deployments do not allow SQLite or the default `/tmp` database
fallback. Any Vercel runtime (`VERCEL=1`) and any `VERCEL_ENV=preview` or
`VERCEL_ENV=production` runtime must set:

```bash
DATABASE_PROVIDER=postgres
DATABASE_URL=[pooled-postgres-url]
DATABASE_URL_DIRECT=[direct-postgres-url]
```

Application request traffic uses pooled `DATABASE_URL`. A direct URL is
validated in production-like deployments so migrations, backup, restore, and
admin workflows cannot ship without a direct connection configured. The
canonical direct variable is `DATABASE_URL_DIRECT`; Vercel-managed Neon can
also satisfy the same role with `DATABASE_URL_UNPOOLED`, and legacy Neon/Vercel
setups may provide `POSTGRES_URL_NON_POOLING`.

## Authentication

Email registration and login are available locally without provider credentials.
Google and Kakao are real OAuth entry points: stub integration mode never creates
a social-login demo session. Configure each provider with the exact callback URL
for the running origin:

```text
http://127.0.0.1:3000/api/auth/google/callback
http://127.0.0.1:3000/api/auth/kakao/callback
```

Register the corresponding HTTPS callback URLs for preview and production
origins in both provider consoles. OAuth callbacks also require a valid
`TOKEN_ENCRYPTION_KEY` in every environment that stores provider tokens. Generate
one with `openssl rand -base64 32`; keep it only in deployment or local secret
configuration.

## Integration Notes

### Naver Store Search

The app defaults to `APP_INTEGRATION_MODE=stub`. In stub mode, Naver search returns deterministic demo-style candidates for development and keeps explicit no-result fixtures for fallback testing.

Use stub mode for local engineering review and browser QA. Production mode is
for credentialed adapter validation and live deployment configuration; do not
run live production integrations locally unless credentials and side effects are
deliberately in scope.

Production Naver search requires:

```bash
APP_INTEGRATION_MODE=production
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...
```

Vercel preview deployments fall back to stub Naver search when
`APP_INTEGRATION_MODE=production` is set but Naver credentials are not present,
so branch previews remain usable for QA. Production deployments still require
the live Naver credentials above.

Naver's official Local Search API reliably provides store name, category, address, road address, coordinates, and a detail link. It does not reliably provide phone numbers, and it does not provide opening hours. Treat phone and opening hours as best-effort fields: the app may attempt to read them from a submitted Naver Place link, but owners should still confirm or enter them manually.

### Google Business Profile Registration

The API inventory, ownership semantics, onboarding field mapping, production
guardrails, and implementation status are documented in
[`docs/integrations/google-business-profile-apis.md`](docs/integrations/google-business-profile-apis.md).

The production integration supports one guarded live-create path: a new Korean
storefront with one accessible GBP account, one exact Google category match,
and no duplicate-search results. It validates first, persists a short-lived
single-use review intent bound to the exact Google payload and subject, then
requires explicit owner approval before creation. Ambiguous accounts,
categories, expired grants, and every existing-listing candidate stop without
creating a duplicate. Existing-profile attachment, service-area businesses,
verification, and live posting remain outside this path.

Enable the Account Management and Business Information APIs for the OAuth
project, configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, the registered
callback URL, and a valid `TOKEN_ENCRYPTION_KEY`, then set:

```bash
APP_INTEGRATION_MODE=production
```

Google must approve the project for Business Profile API access. There is no
separate sandbox: a successful production setup request creates a real listing
in the connected owner's account. The account resource is discovered after
OAuth; no static Google Business account ID is required.
