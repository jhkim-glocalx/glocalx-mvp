<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:git-rules -->
# Git workflow

## Branch strategy (GitHub Flow / trunk-based)

`main` is the only long-lived branch and is always deployable. There is
deliberately no persistent `dev`/staging branch — that pattern let `dev`
drift 17 commits ahead of `main` (including security fixes) before anyone
noticed, which defeats the point of `main` being the source of truth.

| Branch | Purpose | Deploys to |
|--------|---------|-----------|
| `main` | Production — always deployable | Vercel production (`glocalx-mvp.vercel.app`) |
| `feat/<name>` | Short-lived feature branches, branched off `main` | Vercel preview (per-push URL) |
| `fix/<name>` | Short-lived bug fix branches, branched off `main` | Vercel preview (per-push URL) |

## Rules

- **Never commit directly to `main`.** All changes go through a PR.
- Branch off `main` for every feature/fix. Each push gets its own Vercel
  preview URL — that preview is the staging environment for the change,
  there's no separate branch to keep in sync.
- CI (lint, typecheck, test, e2e, build) must pass before merging.
- Merge via PR once CI is green and the preview looks right. Merging to
  `main` deploys to production immediately, so keep branches short-lived
  (hours to a couple of days) to keep that low-risk.
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

## Stacked PRs (a PR branched off another open PR)

When PR **B** is branched off PR **A**'s branch instead of `main`:

- **Retarget B to `main` before merging A** — or merge A **without**
  `--delete-branch`. Deleting A's branch while it is still B's base makes
  GitHub **close** B (it does *not* auto-retarget it), and a PR whose base
  branch is gone cannot be reopened.
- **Recovery if B was closed this way:** rebase B onto the updated `main`
  and open a fresh PR. Because A was squash-merged, drop A's now-redundant
  commits by replaying only B's own:

  ```bash
  git rebase --onto origin/main <A-branch-tip-sha> <B-branch>
  git push --force-with-lease
  gh pr create --base main --head <B-branch>
  ```

  Verify `git diff --stat origin/main...HEAD` shows only B's files before
  pushing.
