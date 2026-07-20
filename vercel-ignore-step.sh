#!/usr/bin/env bash
#
# Vercel "Ignored Build Step" for this npm-workspaces monorepo.
#
# Each app is its own Vercel project (apps/owner-app, apps/admin) sharing one
# repo, so a push to `main` triggers BOTH projects. This gate skips a project's
# build when nothing it depends on changed. Configure it per project under
# Settings -> Build and Deployment -> Ignored Build Step (Vercel runs the
# command from the project's Root Directory, i.e. apps/<app>):
#
#   owner-app project:  bash ../../vercel-ignore-step.sh apps/owner-app
#   admin project:      bash ../../vercel-ignore-step.sh apps/admin
#
# A project builds when ITS app dir, any shared package, or a root build file
# changed; a packages/* or lockfile change rebuilds every app. Vercel's
# convention: exit 1 = proceed with the build, exit 0 = skip it.
set -euo pipefail

root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# App directory to gate on: an explicit arg wins; otherwise infer it from the
# working directory (Vercel runs this from the project's Root Directory).
if [ "$#" -ge 1 ]; then
  app_dir="$1"
else
  app_dir="${PWD#"$root"/}"
fi

# If we can't identify a workspace app, fail safe by building rather than
# silently skipping a deploy that should have happened.
case "$app_dir" in
  apps/*) : ;;
  *)
    echo "vercel-ignore-step: could not determine an app dir (got '$app_dir') — building."
    exit 1
    ;;
esac

cd "$root"

# First deployment (or a clone without the parent commit): build.
if ! git rev-parse "HEAD^" >/dev/null 2>&1; then
  echo "vercel-ignore-step: no previous commit to diff against — building."
  exit 1
fi

# Paths whose changes should trigger a build for this project.
if git diff --quiet "HEAD^" HEAD -- \
  "$app_dir" \
  packages \
  package.json \
  package-lock.json \
  tsconfig.base.json \
  tsconfig.json; then
  echo "vercel-ignore-step: no changes affecting $app_dir — skipping build."
  exit 0
fi

echo "vercel-ignore-step: changes affect $app_dir — building."
exit 1
