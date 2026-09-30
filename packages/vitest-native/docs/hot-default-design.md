# Design: hot runtime as a safe default for greenfield apps

**Status:** Layers 1–2 shipped; Layer 3 remains a proposal
**Basis:** the idiomatic hot-parity validation + default-flip de-risk (`validation/idiomatic/`)

> Memory update (2026-08-31): explicit hot mode now installs a cgroup-aware,
> worker-total budget. It caps automatic concurrency, recycles one worker at a time
> on local heap or process RSS, and refuses current Vitest's unrecyclable one-worker
> mode unless the user explicitly accepts that risk. The old host-only transitional
> heap formula has been removed.
>
> Architecture bake-off update (2026-08-27): a Vitest-owned selective-persistence
> prototype now passes the bare/Expo/Expo Router correctness matrix, but current hot
> remains faster and lower-RSS at two workers. Hot therefore stays the production
> benchmark while the selective-actual primitive is pursued upstream; see
> `runtime-architecture-bakeoff.md`.
>
> Decision update (2026-08-30): selective persistence is no longer the target for
> React Native. A smaller upstream `isolate: "modules"` prototype reuses stock
> Vitest workers, resets the complete Vite graph/mocks per file and leaves RN in its
> Node CommonJS registry. It passes the real RN/RNTL correctness, coverage,
> two-project and recycling gates and runs within about 15% of current hot on the
> representative 136-file suite. Current hot remains production until that primitive
> is supported and the memory/state work below is complete.
>
> State update (2026-09-01): the current hot runtime now restores an ordered,
> declarative state manifest at every file boundary and verifies the final realm.
> Eleven mutation legs prove timers/stubs, native-boundary state, known RN state,
> environment, process/RN listeners, globals, console, ErrorUtils and Expo state are
> each observable. Normal hot resets the precompiled RN registry's module instances
> per file; resident-RN manifest legs are additionally exercised with the registry
> disabled.
>
> Auto-selection update (2026-09-01): `hotRuntime: "auto"` now selects bounded hot
> only for recyclable, non-migration, stock-pool native configurations. A packed
> consumer gate proves the enable path plus one-worker, Jest-compat and explicit-pool
> fallbacks, including their reason diagnostics. The selection hook runs after other
> Vite config hooks; adversarial legs inject a pool and Jest setup from later plugins
> and prove both are observed before the runtime is chosen.

## What the data established

- **Correctness is not the blocker.** On idiomatic vitest-first apps, hot is
  correctness-identical to the default engine — single- and multi-worker, 135→1000
  files, with a negative control proving the cross-file bleed probes are sensitive.
  The old "hot can't be default because of state bleed" framing is dead for the
  greenfield audience.
- **Memory is the real constraint, and it's a tradeoff.** Historical idiomatic
  validation observed ~4 MB/file and 2.47 GB at 500 files. The current packed
  RN 0.87/RNTL 14 workload grows more slowly but still linearly: 121 MiB after GC at
  136 files and 315 MiB at 406 files. The architectural conclusion is unchanged.
  - Current single-worker hot cannot recycle because Vitest batches all files into
    one task, so it remains structurally unsafe for sufficiently large suites.
  - Recycling at real per-file task boundaries bounds the growth. The validated
    module-isolation prototype completed 406 files with a 96 MiB threshold, eight
    recycles, 679 MiB peak RSS and 54 MiB final worker heap.
- **Migration suites are out of scope.** hot is _not_ clean for jest-compat
  suites (the paper bake-off); that's a migration-tooling problem, separate from
  the engine.
- **Coverage attribution matches isolation.** A packed 40-file RN fixture produces
  byte-identical default/hot coverage maps and exact execution counts under both V8
  and Istanbul, including an uncovered-function negative control.

So the question is no longer _whether_ hot is correct enough to default — it is —
but _how_ to default it without the memory footgun or breaking migration suites.

## Design principles

1. **Safe when enabled.** Turning hot on must never silently grow unbounded.
   A current-Vitest one-worker run fails closed unless the explicit
   `allowUnboundedMemory` escape hatch is present.
2. **Opt-in escalation.** Don't flip the global default for everyone in one step.
   Make hot _safe to enable_, then _auto-enable where provably safe_, then
   (much later, with real-world data) consider the global default.
3. **Honest fallbacks.** Where hot can't be made safe (single-worker large, or
   jest-compat suites), fall back or warn — never pretend.

## Layer 1 — Bounded hot (implemented)

Explicit hot mode computes one project memory plan before registry compilation:

- effective memory is the lower valid value of `os.totalmem()` and
  `process.constrainedMemory()`;
- soft process RSS is 80% and the fail-closed hard boundary is 90%;
- the plan reserves 256 MiB for the main process and 192 MiB for overlapping old/new
  workers during replacement;
- one worker is admitted per remaining 256 MiB envelope, with an automatic maximum
  of four;
- the worker-local heap recycle threshold is 65% of its envelope, clamped to
  96–512 MiB.

The pool samples thread-local `heapUsed` and process-wide RSS. Only one soft-limit
recycle may be in flight, so simultaneous workers cannot all create replacement
overlap. A task is rejected before it starts if RSS has reached the hard boundary.
Explicit `maxWorkers` above the admitted count is capped with a warning; default
concurrency is capped silently and becomes explainable with `diagnostics:true` and
in `vitest-native doctor`.

**Single-worker is the residual unsafe case in current Vitest.** With
`isolate:false`, Vitest batches every file into one scheduler task, so no pool can
recycle between files. Explicit hot mode therefore fails during config if the plan
or user config selects one worker. A deliberate externally bounded run can opt in
with `hotRuntime: { allowUnboundedMemory: true }`; the runtime warns again if it sees
the actual multi-file batch. This escape hatch disables the automatic worker cap and
process-RSS enforcement. It is not the default and is not described as bounded.

Docker cgroup v2 probes on Node 20.20.2 established that
`process.constrainedMemory()` exactly reports 512 MiB, 1 GiB and 2 GiB limits where
host memory is misleading. Unit, native, isolation and recycle-soak gates cover the
production controller. A packed Node 22 / RN 0.87 / RNTL 14 gate then ran 405 files:
512 MiB and 1 GiB both failed during config with `HOT_MEMORY_UNBOUNDED`, while 2 GiB
capped an explicit eight-worker request to four, completed the suite and
demonstrably recycled. None was
OOM-killed. Broader CI/container calibration remains before Layer 2 is promoted.

## Layer 2 — `hotRuntime: 'auto'` (implemented)

A third value that enables hot only when it is both _safe_ and _beneficial_:

```ts
reactNative({ engine: "native", hotRuntime: "auto" });
```

Enable hot when ALL hold (else fall back to the default per-file engine):

- **Not a migration suite.** No `jestMockTransform` plugin and no jest-compat
  setup file present (inspect the resolved Vite config in `configResolved`). hot
  isn't clean for jest-compat patterns, so don't auto-enable there.
- **Recyclable task boundaries.** On current hot this requires resolved
  `maxWorkers >= 2`. With the validated module-isolation scheduler change, one worker
  also receives one file per task and can recycle safely.
- **Enough headroom.** Use a constrained-memory-aware total RSS plan, including main
  process and old/new worker overlap, rather than a fixed host-memory-per-worker
  estimate.
- **No pool takeover.** An explicitly selected pool remains selected; automatic mode
  does not replace it with the native hot pool.

Suite size (hot's win amortizes over many files) is only known after collection,
so `'auto'` keys on config-time signals; a tiny suite still works under hot, just
without a speed win — acceptable.

## Layer 3 — global default flip (future, gated)

Only after `'auto'` has real-world mileage would we consider making `'auto'` the
default for the native engine. Gating evidence: a real greenfield app validated,
memory behavior confirmed across CI shapes, and the migration story handled. Not
part of this proposal.

## Memory model (the math we are bounding)

| config                     | peak RSS @500 files | bounded?                       |
| -------------------------- | ------------------- | ------------------------------ |
| default (isolate:true), 4w | 836 MB              | yes (recreates per file)       |
| hot, 1 worker              | 2466 MB             | **no** (unbounded, ~4 MB/file) |
| hot + recycle, 4w          | 1523 MB             | yes (flat to 1000 files)       |

Layer 1 makes the bounded row the out-of-the-box behavior whenever workers ≥ 2.

## Guardrails & warnings

- Single-worker explicit hot → fail closed during config, unless
  `allowUnboundedMemory:true` makes the risk deliberate and visible.
- Process RSS at the hard boundary → stop before another worker/task starts and
  report `HOT_MEMORY_BUDGET_EXCEEDED`, rather than waiting for exit 137/OOM.
- `'auto'` that declines to enable hot → a one-line diagnostic explaining why
  (jest-compat detected / single worker / low memory), so it isn't a silent no-op.

## Open questions

1. Repeat the passing packed Linux cgroup gate across common CI providers, cgroup v1
   and different RN/RNTL generations; calibrate from evidence rather than treating
   the first constants as permanent.
2. Reuse an upstream full module-isolation API if it lands. It removes the custom
   worker/private module-reset path and gives one-worker runs recyclable file tasks;
   a thin memory-aware pool may still be required.

## Rollout sequence

1. **Layer 1 (bounded explicit hot)** — shipped with cgroup-aware worker-total/RSS
   budgeting and verified shared-realm restoration; current one-worker batching
   fails closed.
2. **Layer 2 (`'auto'`)** — shipped as an explicit, conservative greenfield opt-in.
3. **Layer 3 (default flip)** — only with the gating evidence above.
