# 0002-b. Keep a runnable exhibit for every real bug and run them all in CI

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Yes
- **Enforced by:** `.github/workflows/bug-museum.yml`, `packages/vitest-native/validation/bug-museum/compare.mjs`, `packages/vitest-native/tests/bug-museum-compare.test.ts`
- **Related:** [0002-a](0002-a-counts-gate-timing-tripwire.md), [0002-f](0002-f-config-axis-matrix.md)

## Decision

Every real bug gets one minimal, runnable exhibit under `validation/bug-museum/` that asserts
the correct behaviour (what Jest, a device or Vitest's own semantics give), so it fails on any
build that has the bug. CI runs the exhibits and compares each verdict with main's recorded
one. The museum's exhibit list is the single backlog of exhibits to add; other records refer
to exhibits by id. An exhibit whose control does not fail on the buggy build is quarantined.

## Context

Several bugs lived in configuration cells or load orders that no gate ran, and fixes were
merged with nothing that would catch their return. A repro that asserts the right answer,
rather than today's answer, doubles as the acceptance test for any later rewrite of the
layer it covers.

## Consequences

- **Gains:** a fixed bug stays fixed; each exhibit records the PR that fixed it and is proven
  against the build before the fix.
- **Costs:** each exhibit is a small workspace to maintain; the museum runs as its own job.
- **Limits:** none for users.

## Alternatives rejected

- Regression tests inside the package suites only: they run in the package's own
  configuration, which is where these bugs did not show.
