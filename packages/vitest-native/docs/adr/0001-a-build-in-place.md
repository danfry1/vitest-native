# 0001-a. Build the target architecture inside the current runtime, one layer at a time

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Yes
- **Enforced by:** Review only
- **Related:** [0001-b](0001-b-capped-flag-table.md) (how behaviour changes ship), [0001-c](0001-c-runtime-core-spike.md) (the one parallel piece), [0002-a](0002-a-counts-gate-timing-tripwire.md) (the gate each refactor passes)

## Decision

There is no second runtime. Each layer of the target architecture is built by refactoring the
existing runtime in place, and a refactor that keeps behaviour the same ships without a flag
once it passes the previous-release compare and the fixed anchors. Interfaces are written
only in the change that first needs two implementations, and collapsed when the flag goes.

## Context

An earlier plan built nine layers as a parallel runtime behind a `model` option, switched over
once, then deleted the old one. Measurement removed most of its reasons:

- The renderer must stay resident: a fresh renderer per file costs 1.05–1.12x wall and
  1.10–1.17x RSS at 1,125 files, and the cost grows with file count. A parallel runtime would
  inherit the same cross-file leaks.
- The memory fix (matcher retention) and the speed fix (re-resolving library mocks per file)
  are both changes to the current runtime.
- No bug from the period needed a second runtime, and the current runtime could not be frozen:
  it took 17 pull requests, two critical fixes and one speed regression in one period.

Evidence kept privately.

## Consequences

- **Gains:** each layer reaches users when it is ready; one CI matrix; shadow comparisons run
  old and new code in one process; code is deleted layer by layer.
- **Costs:** some refactors touch every user with no flag, so they rest on the previous-release
  compare. The codebase can be left half-migrated; the structural scorecard
  ([0002-d](0002-d-structural-scorecard.md)) guards against that.
- **Limits:** none visible to users beyond each layer's own change.

## Alternatives rejected

- A parallel runtime with the current one frozen: double maintenance, a doubled test matrix,
  no kill criterion, and the freeze was disproved within one period.
- A two-arm spike of the whole plan: only the runtime core is open; kept as the fallback if
  the Node dispatcher work stalls.
- Incremental fixes with no target: the status quo, 68 `fix:` commits against 32 `feat:`.
- One flag per change, each live for two minors: about 17 flags would take about 16 minors.
