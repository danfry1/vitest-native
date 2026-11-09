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
)

head="${VERCEL_GIT_COMMIT_SHA:-HEAD}"
# The last deployed commit on this branch, when Vercel knows it: a push can carry several
# commits, and a squash merge is one. Otherwise, the commit before this one.
base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$base" ] || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  base="${head}^"
fi
# No history to compare with (a first commit, a shallow clone): build.
git cat-file -e "${base}^{commit}" 2>/dev/null || exit 1

if git diff --quiet "$base" "$head" -- "${SITE_INPUTS[@]}"; then
  echo "No site input changed between ${base} and ${head}: skipping the deployment."
  exit 0
fi
echo "A site input changed: building."
exit 1
