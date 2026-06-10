# GlocalX MVP

GlocalX is a mobile-first owner assistant for Naver business extraction and Google Business Profile operations. This scaffold starts with a credential-free stub mode and leaves production integrations behind explicit adapter boundaries.

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

## Local App

Run the app at `http://127.0.0.1:3000`.

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

## Environment

Copy `.env.example` to `.env.local` and keep real credentials out of git. Stub mode is the default until Naver Developers and Google Business Profile credentials are available.

## Integration Notes

### Naver Store Search

The app defaults to `APP_INTEGRATION_MODE=stub`. In stub mode, Naver search returns deterministic demo-style candidates for development and keeps explicit no-result fixtures for fallback testing.

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
