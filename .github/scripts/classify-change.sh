#!/usr/bin/env bash
# Classifies a pull request as docs-only: every changed file is prose, a changeset,
# licence text, or a static site asset. Workflows use the result in job-level `if:`
# conditions, never in `on.<event>.paths`: GitHub reports a job skipped by a
# condition as successful, but leaves the checks of a workflow skipped by path
# filtering pending, which blocks a required check ("Troubleshooting required status
# checks", GitHub Docs).
#
# Two website pages are NOT prose: fidelity.md and fidelity-matrix.md are GENERATED
# from the live corpus and gated by fidelity:check / the matrix placeholder test, so a
# hand-edit there must still fail CI the way it did in #181. Anything other than a
# pull request (a push to main, a schedule, a manual run) is never docs-only.
#
# Usage: classify-change.sh <event> <base-sha> <head-sha>   (needs full history)
# Writes `docs-only=true|false` to $GITHUB_OUTPUT when set, and always to stdout.
set -euo pipefail

event=$1 base=${2:-} head=${3:-}
docs_only=false
if [ "$event" = "pull_request" ]; then
  docs_only=true
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    echo "  $f"
    case "$f" in
      website/guide/fidelity.md|website/guide/fidelity-matrix.md) docs_only=false ;;
      *.md|.changeset/*|LICENSE|website/public/*) ;;
      *) docs_only=false ;;
    esac
  done < <(git diff --name-only "$base" "$head")
fi
echo "docs-only=$docs_only"
if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "docs-only=$docs_only" >> "$GITHUB_OUTPUT"; fi
