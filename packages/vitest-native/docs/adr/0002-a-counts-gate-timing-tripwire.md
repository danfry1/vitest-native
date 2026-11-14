# 0002-a. Gate on deterministic counts against fixed anchors; treat timings as tripwires

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: count tests exist for single paths (shared-resolver filesystem calls, require-bridge counters); there is no aggregate count report, no fixed anchors, and no workflow runs the scale suite's count configs.
- **Enforced by:** `packages/vitest-native/tests/shared-resolver-cost.test.ts`
- **Related:** [0002-e](0002-e-compare-modes.md) (the compare it runs beside), [0005-a](0005-a-shared-resolver.md) (states its budget in counts)

## Decision

The hard gate is deterministic counts and bytes: transforms, compiles, resolutions and misses,
source reads, stats, modules instantiated per file, worker boots and recycles, cache hits,
cache and registry bytes, and heap KiB per file after a forced GC. Every budget is cumulative
against a fixed anchor (wall ≤ 1.05x, max RSS ≤ 1.10x, heap ≤ anchor + 10 KiB per file), never
"today plus x" per change; anchors move only by a recorded maintainer decision. Timings are
tripwires and gate nothing until a dedicated runner passes an A/A test (95% CI half-width ≤ 2%
on the median paired ratio at n = 10).

## Context

Bugs reached main while every required gate was green. Laptop timing is too noisy to gate on:
across recorded paired runs the per-phase standard deviation ranged from 0% to 14.9%, and at
n = 5 with an SD of 3.6% a true 1.03x regression passes a 1.05x gate 84% of the time
(simulated from those runs). In-process millisecond readings move with machine load too.
Counts do not: the regression where compiles per file went from 11 to 347 would have failed
a count gate. Per-step ratios compound, 1.03x over 11 steps is 1.38x, so budgets are
cumulative. Evidence kept privately.

## Consequences

- **Gains:** every change gets a deterministic gate; timing cannot launder a regression
  across steps.
- **Costs:** a count report and recorded anchors must be built and maintained.
- **Limits:** release notes promise "no count regression against the released anchor; timing
  is a tripwire", not "never slower". Counts miss per-operation cost changes, timeout-dominated
  wall time and recycle storms within budget.

## Alternatives rejected

- Laptop timing as a hard gate: misses a true 1.03x regression 84% of the time.
- A per-step ratio: compounds; the cumulative check covers it.
- In-process millisecond readings as hard counters: they move with load and have no A/A test.
- A full timing protocol with no runner to run it on.
