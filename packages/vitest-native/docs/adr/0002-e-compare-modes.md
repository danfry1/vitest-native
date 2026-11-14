# 0002-e. Compare candidates against Jest, the previous release and the fixed anchors

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: `compare` runs Jest against the candidate only, and buckets every failed→failed pair as the same; the previous-release (`--a/--b`) and anchor modes and signature matching are absent.
- **Enforced by:** `packages/vitest-native/tests/cli-compare.test.ts`
- **Related:** [0002-a](0002-a-counts-gate-timing-tripwire.md) (the anchors), [0001-a](0001-a-build-in-place.md) (refactors rest on the previous-release mode)

## Decision

Compare runs in three modes: Jest against the candidate, the previous release against the
candidate, and a fixed anchor against the candidate. In every mode a failed→failed pair
matches only when the error class and the first line of the message both match; corpus
snapshots are re-recorded under Jest; and each corpus app counts as a gate only above its
recorded pass floor.

## Context

A compare that treats any failed→failed pair as a match cannot see a change in a test that
already fails, and about a quarter of the corpus fails today: Paper fails 195 of 715 tests,
about 115 of them on stale snapshots. Refactors that ship without a flag rely on a
previous-release compare to show that behaviour did not change.

## Consequences

- **Gains:** a refactor can show zero unexplained per-test diffs against the last release.
- **Costs:** snapshots must be re-recorded under Jest and floors maintained per app.
- **Limits:** an explained pass→fail is accepted only when Jest fails the same test or a
  deviation entry with a probe covers it, capped at 5 cases and 0.5% of an app's tests per
  category.

## Alternatives rejected

- Bucket fail→fail by status alone: hides regressions in the failing quarter of the corpus.
