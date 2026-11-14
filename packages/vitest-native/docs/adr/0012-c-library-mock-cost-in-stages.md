# 0012-c. Fix the cost of libraries' own mocks in stages, cheapest first, against a bar stated in counts

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: the resolution memo and precompiled library registries (remedy C) are on main; the compile-versus-evaluation split, the count-derived bar and remedies D and B are not.
- **Enforced by:** `packages/vitest-native/tests/loader-resolution-memo.test.ts`, `packages/vitest-native/tests/registry-library.test.ts`
- **Related:** [0012-b](0012-b-library-own-test-support-first.md) (depends on)

## Decision

First land the resolution memo. Then measure, by deterministic counts per file, whether the
remaining cost is compile (compile-cache hits and misses, V8 function-compile events) or
evaluation (module factory invocations). Then pick the cheapest remedy that fits: D, V8 code
caching, for compile; C, precompiled library graphs, for compile plus resolution; B, resident
library mocks with one declared reset and one probe per library, for evaluation. The bar:
the per-file count excess over the hand-written presets, times measured unit costs, stays
within 5% of their per-file wall time at one worker (about 1.5 ms).

## Context

On a 60-file suite using gesture-handler 3 and reanimated 4.7 (hot, one worker), libraries'
own mocks took 353 source reads and 347 instantiations per file against 13 and 11 with
presets: 1.69–1.76x wall. The memo cut reads to 43 but left 347 instantiations: 1.24x. The
rest is about 30 µs per module, so 1.05x needs about 200 instantiations per file or fewer.
Evidence kept privately.

## Consequences

- **Gains:** a remedy chosen by measurement; no fallback returns gesture-handler 3 users to the missing-helper bug.
- **Costs:** if the cost is evaluation, only B lowers instantiations, and B reintroduces declared per-library resets.
- **Limits:** the next stable release does not wait for the bar; C grows the registry key with each library version.

## Alternatives rejected

- Go straight to C: C removes compile and resolution, not instantiation.
- Own mocks with no remedy: 1.24x even with the memo.
- A wall-time bar ("+10 ms"): not reproducible without a dedicated timing runner.
