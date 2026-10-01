# Design: hot runtime as a safe default for greenfield apps

**Status:** Layers 1–3 shipped (`'auto'` is the default since 2026-09-30; Jest-migration suites admitted since 2026-10-01)
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
- **Migration suites were out of scope at the time.** hot was not clean for
  jest-compat suites. That changed on 2026-10-01: see Layer 3, "The migration
  story", for the gate that now covers them and the leaks it found and fixed.
- **Coverage attribution matches isolation.** A packed 40-file RN fixture produces
  byte-identical default/hot coverage maps and exact execution counts under both V8
  and Istanbul, including an uncovered-function negative control.

So the question is no longer _whether_ hot is correct enough to default — it is —
but _how_ to default it without the memory footgun or breaking migration suites
(the latter settled by Layer 3's migration gate).

## Design principles

1. **Safe when enabled.** Turning hot on must never silently grow unbounded.
   A current-Vitest one-worker run fails closed unless the explicit
   `allowUnboundedMemory` escape hatch is present.
2. **Staged escalation.** Don't flip the global default for everyone in one step.
   Make hot _safe to enable_, then _auto-enable where provably safe_, then make
   that selector the default once its gates hold (Layer 3).
3. **Honest fallbacks.** Where hot can't be made safe (single-worker large, an
   explicit pool, a Vitest version mismatch), fall back or warn — never pretend.

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

- ~~**Not a migration suite.**~~ Dropped 2026-10-01 (see Layer 3, "The migration
  story"): the jest-compat surface now has its own cross-file isolation gate.
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

## Layer 3 — `'auto'` as the default (implemented 2026-09-30)

`hotRuntime` defaults to `'auto'` for the native engine. The gates this section
originally set, and the package-owned evidence for each:

- **Correctness across files:** the hot isolation suite, the state-manifest
  mutation gate (every restore action removed in turn must fail by name), the
  hot user-setup gate, and `validate:hot-parity` (no test that passes under
  per-file isolation fails under hot).
- **Memory across CI shapes:** the cgroup-aware memory plan, the 100-file soak
  with recycling, and the full suites on Linux, macOS and Windows. The packed
  cgroup gate runs on Linux only; other providers and cgroup v1 remain open
  question 1.
- **The migration story:** suites set up for Jest migration are admitted since
  2026-10-01, on package-owned evidence. `tests-native/hot-jest-compat` runs the
  jest-compat surface in one reused worker and in a per-file control: hoisted,
  partial, Node-owned and React Native clone-and-override `jest.mock`; runtime
  mocks (`doMock`, `setMock`, `dontMock`, `resetModules`); factory-less mocks via
  `__mocks__` and automock; spies, fake timers, `jest.setTimeout`, globals,
  `process.env`, `requireActual` export mutation and spies on a Node-owned
  package's exports; `jest.setSystemTime`; snapshot state; React Native Testing
  Library trees left mounted; and a project setup file's top-level `jest.mock`s,
  custom matcher, global and console spy, each applied exactly once per file. Building it found three hot-only leaks (a queued `doMock`, a
  resident RNTL's missing per-file cleanup, and the shim's relative-path anchoring),
  each fixed and mutation-tested. `tests-native/hot-user-setup` covers fake timers
  installed by a user setup file. External bake-off apps corroborate but are not the
  evidence: their Jest-era setup and shims are theirs, not the package's.
- **A real greenfield app:** covered only by the packed consumer fixtures, which
  are small. This is the gate least met; the default's fallback and
  `hotRuntime: false` are the mitigation, and a test that passes alone but fails
  after other files is the signal to use it.

Implicitly selected, `'auto'` is quiet: a fallback, or a worker cap from the
memory plan, prints only when `hotRuntime` was set explicitly or `diagnostics` is
on. A Vitest version mismatch between the worker and the project, fatal for an
explicit `hotRuntime`, is one more reason for `'auto'` to fall back.

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
  (jest-compat detected / single worker / low memory / Vitest version mismatch)
  when `'auto'` was set explicitly or `diagnostics` is on; as the implicit
  default it falls back quietly.

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
3. **Layer 3 (default flip)** — shipped; see the Layer 3 section for the evidence
   against each gate and the one that is least met.
