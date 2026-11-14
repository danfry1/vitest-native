# 0002-d. Ratchet a structural scorecard so the risky-pattern count never rises

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: the scorecard counts four metrics (Node patch sites, `VITEST_NATIVE_*` names, `__vitest_native_*` globals, swallowed catches) and fails any rise per metric; seams, live flags, runtime dependencies and CI minutes are not counted, and there is no register of signed exceptions.
- **Enforced by:** `packages/vitest-native/scripts/structural-scorecard.mjs`, `packages/vitest-native/tests/structural-scorecard.test.ts`, `.github/workflows/ci.yml`
- **Related:** [0001-a](0001-a-build-in-place.md) (guards against a half-migrated codebase)

## Decision

A script counts the runtime's risky structural patterns: Node patch sites, worker-read
`VITEST_NATIVE_*` variables, `__vitest_native_*` globals, swallowed catches, reset-list
entries, seams registry entries, live flag-table entries, runtime dependencies, packed size
and CI minutes per tier. The total may not rise from one release to the next, net. A rise is
allowed only when deletions in the same release offset it, or as a registered exception with
a named reason, a deletion step or "permanent", and maintainer sign-off. Exceptions are counted
too.

## Context

Building in place risks a codebase left half-migrated, where each layer adds a patch and
removes none. The counts make the ordinary ways of adding a patch, a switch, a global or a
swallowed error visible in review.

## Consequences

- **Gains:** each layer must remove more structure than it adds; an improvement is locked in
  by the change that makes it.
- **Costs:** the scorecard reads text with regular expressions, so indirect patches go
  uncounted; it is a tripwire for honest code, not an enforcement boundary.
- **Limits:** none for users. Packed size has its own check (`scripts/check-package-size.mjs`).

## Alternatives rejected

- No ratchet, review only: the counts had risen unnoticed before the scorecard existed.
