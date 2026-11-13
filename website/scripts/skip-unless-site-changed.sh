#!/usr/bin/env bash
# Vercel's ignoreCommand (vercel.json): exit 0 skips the deployment, exit 1 builds it.
#
# The site builds only when something it is built from changed: website/, and the files the
# build reads from outside it. tests/site-inputs.test.ts derives that set from the build's
# own imports and fails when this list misses one.
set -u

SITE_INPUTS=(
  website
  vercel.json
  package.json
  bun.lock
  packages/vitest-native/src/docs-url.mjs
  packages/vitest-native/src/errors.mjs
  packages/vitest-native/src/node-range.ts
  packages/vitest-native/src/peer-requirements.ts
  packages/vitest-native/tests/fixtures/sample-app/jest.config.js
  packages/vitest-native/tests/fixtures/sample-app/jest.setup.js
)

head="${VERCEL_GIT_COMMIT_SHA:-HEAD}"
# Vercel's last successful deployment, when it names one: a push can carry several commits,
# and a squash merge is one. For a pull request's branch that is often a newer commit on
# main, so diffing straight from it would count every site change main made since the
# branch left it. The merge base of the two is where this branch's own changes start.
previous="${VERCEL_GIT_PREVIOUS_SHA:-}"
base=""
if [ -n "$previous" ] && git cat-file -e "${previous}^{commit}" 2>/dev/null; then
  base="$(git merge-base "$previous" "$head" 2>/dev/null || true)"
  # No common history (the previous deployment was another branch's orphan commit): build.
  if [ -z "$base" ]; then
    echo "No common history with the previous deployment ${previous}: building."
    exit 1
  fi
fi
# Otherwise, the commit before this one.
[ -n "$base" ] || base="${head}^"
echo "Comparing site inputs from ${base} to ${head} (previous deployment: ${previous:-none})."
# No history to compare with (a first commit, a shallow clone): build.
git cat-file -e "${base}^{commit}" 2>/dev/null || exit 1

if git diff --quiet "$base" "$head" -- "${SITE_INPUTS[@]}"; then
  echo "No site input changed: skipping the deployment."
  exit 0
fi
echo "A site input changed: building."
exit 1
