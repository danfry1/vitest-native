# 0015-b. Hold the mock engine to real React Native with a cross-check whose probe count may not fall

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Yes
- **Enforced by:** `packages/vitest-native/scripts/crosscheck.mjs`, `packages/vitest-native/scripts/fidelity-report.mjs`, `packages/vitest-native/tests/fidelity-corpus-floor.test.ts`, `.github/workflows/ci.yml`
- **Related:** [0015-a](0015-a-keep-mock-engine-frozen-scope.md)

## Decision

Every commit runs the cross-check corpus under both engines and fails if any probe's
observable result differs. Probes compare raw API outputs. The published probe count is
a floor: a run that reports fewer probes fails unless the floor is lowered deliberately.

## Context

A hand-written mock drifts from React Native silently. The cross-check found and fixed
at least five real mock bugs before this record. A corpus can also shrink without going
red: an import that throws or a `describe` that never runs removes probes while the pass
rate stays at 100%. The floor check in `fidelity-report.mjs` catches that.

## Consequences

- **Gains:** the mock engine's fidelity claim is backed by a count that cannot quietly
  fall.
- **Costs:** every mock fix needs a probe; retiring a probe needs an explicit flag.
- **Limits:** fidelity covers only what the probes cover; differences outside the corpus
  are listed on the published fidelity page.

## Alternatives rejected

- Rely on review alone: nothing would notice the mock drifting as React Native changes.
  If the probe count falls in two releases running, reconsider the mock engine (0015-a).
