# 0014-a. Admit the hot runtime only when workers can be recycled between files, and never decline silently

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Yes
- **Enforced by:** `packages/vitest-native/tests/memory-plan.test.ts`, `packages/vitest-native/tests/hot-runtime-auto-options.test.ts`, `packages/vitest-native/validation/hot-auto/run.mjs`, `packages/vitest-native/validation/bug-museum/exhibits/cfg-explicit-max-workers`
- **Related:** [0016-c](0016-c-collapse-hot-runtime-options.md)

## Decision

The hot runtime's memory plan is sized from the resolved worker count (#347). Hot is
admitted only when the run has recyclable task boundaries: at least two workers, no
explicit custom pool. Otherwise the run keeps per-file isolation and prints why. Running
hot with every file batched into one task needs an explicit `allowUnboundedMemory: true`;
it is never the automatic choice.

## Context

At one worker Vitest batches every file into one task, so a worker cannot be recycled
mid-run. An earlier build grew its mock registry by 4.2 MB per file under hot and ran out
of memory at about 970 files. Batched hot also makes one leaked `act` fail every later
file in the batch, so on 2-vCPU CI it would turn a single leak into a failed run.

Hot is declined when the memory plan resolves to fewer than two workers, when
`--maxWorkers=1` or `--no-file-parallelism` is passed, or when `isolate` or `pool` is set
explicitly. At one worker, stock isolation measured 131.8 ms per file against 9.2 ms for
hot. Evidence kept privately.

## Consequences

- **Gains:** memory is bounded wherever hot runs; a leak in one file cannot take down
  the rest of a batch by default.
- **Costs:** 1-worker runs (small CI runners, `--maxWorkers=1`) stay on stock isolation
  and pay its per-file cost.
- **Limits:** users see a one-line reason when `'auto'` falls back. `allowUnboundedMemory`
  also turns off the worker cap and the process-RSS stop; it is meant for runs with an
  external memory boundary.

## Alternatives rejected

- Admit hot at one worker while batched: one leaked `act` fails the rest of the batch.
- Rely on recycling to fix growth: recycling cannot happen at one worker, and it hides
  growth rather than fixing it.
