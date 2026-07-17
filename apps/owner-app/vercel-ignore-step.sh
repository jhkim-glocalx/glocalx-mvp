#!/bin/bash
# Vercel Ignored Build Step for the owner-app project.
# Exit 0 skips the build; exit 1 builds. Build when this app, shared
# packages, or the workspace lockfile changed — a stale packages/ trigger
# would serve outdated shared code (docs/v2/architecture.md §1).
git diff HEAD^ HEAD --quiet -- . ../../packages ../../package.json ../../package-lock.json && exit 0 || exit 1
