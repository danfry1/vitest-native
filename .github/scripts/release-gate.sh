#!/usr/bin/env bash
# The release gates both jobs of release.yml run: the tag must be on main, and it must
# name the package's version. `verify` runs them first so a wrong tag fails before the
# test suite; `publish` runs them again itself, because it does not take another job's
# word for anything it publishes.
#
# This workflow fires on any v* tag from any commit, and the release flow tags a SHA by
# hand after merging. Tagging the wrong one (a branch commit, or a stale commit from
# before a fix landed) would publish it with provenance that looks authoritative, so
# anything main cannot reach is refused. Needs full history (fetch-depth: 0).
#
# Usage: release-gate.sh <tag name, e.g. v0.14.0-rc.13>
set -euo pipefail

tag=$1
git fetch --no-tags origin main
if ! git merge-base --is-ancestor HEAD origin/main; then
  echo "::error::The tagged commit $(git rev-parse HEAD) is not on main. Tag a commit that main can reach."
  exit 1
fi

version=$(node -p "require('./packages/vitest-native/package.json').version")
if [ "$tag" != "v$version" ]; then
  echo "::error::Tag $tag does not match package version $version."
  exit 1
fi
