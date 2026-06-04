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
