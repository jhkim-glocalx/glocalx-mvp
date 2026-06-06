<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:git-rules -->
# Git workflow

## Branch strategy (trunk-based)

| Branch | Purpose | Deploys to |
|--------|---------|-----------|
| `main` | Production — always deployable | Vercel production (`glocalx-mvp-tawny.vercel.app`) |
| `dev` | Staging — integration branch for ongoing work | Vercel preview (stable URL) |
| `feat/<name>` | Short-lived feature branches | Vercel preview (per-push URL) |
| `fix/<name>` | Short-lived bug fix branches | Vercel preview (per-push URL) |

## Rules

- **Never commit directly to `main`.** All changes go through `dev` or a PR.
- Branch off `dev`, not `main`. Merge back to `dev` when done.
- `main` is updated only by merging `dev` (or a hotfix PR) once staging is verified.
- Use fast-forward merges when possible; no merge commits on `dev`.
- Delete feature/fix branches after merging.

## Commit conventions (Conventional Commits)

```
<type>(<scope>): <short description>
```

Types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `style`, `perf`

Examples:
- `feat(auth): add demo owner session flow`
- `fix(onboarding): expose clear submit and next actions`
- `chore(git): exclude AI tooling and business files from tracking`

## What NOT to commit

The following are gitignored and must never be committed:
- `.claude/` — AI tooling config
- `.omo/` — agent scratch space
- `.gstack/` — gstack tooling
- `01_documents/`, `02_assets/`, `workspace/` — business files, not app code
- `.env` — secrets (use `.env.example` for the template)
<!-- END:git-rules -->
