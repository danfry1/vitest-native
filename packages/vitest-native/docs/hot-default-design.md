# Design: hot runtime as a safe default for greenfield apps

**Status:** Layer 1 shipped; Layers 2–3 remain proposals
**Basis:** the idiomatic hot-parity validation + default-flip de-risk (`validation/idiomatic/`)

> Update (2026-08-27): enabling hot without an explicit recycling option now
> installs a default per-worker heap limit. The current formula is
> `clamp(os.totalmem() * 0.25, 768 MB, 1.5 GB)`. This is a transitional safety
> bound, not the final worker-total budget described below: it is host-memory based,
> does not divide by worker count, measures heap rather than RSS, and cannot fire in
> Vitest's single-worker batched mode.
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

So the question is no longer _whether_ hot is correct enough to default — it is —
but _how_ to default it without the memory footgun or breaking migration suites.

## Design principles

1. **Safe when enabled.** Turning hot on must never silently grow unbounded.
   Today `hotRuntime: true` on a single worker leaks with only a warning.
2. **Opt-in escalation.** Don't flip the global default for everyone in one step.
   Make hot _safe to enable_, then _auto-enable where provably safe_, then
   (much later, with real-world data) consider the global default.
3. **Honest fallbacks.** Where hot can't be made safe (single-worker large, or
   jest-compat suites), fall back or warn — never pretend.

## Layer 1 — Bounded hot (implemented, with remaining budget work)

When `hotRuntime` is truthy and the user has NOT set an explicit `memoryLimit` /
`recycleAfterFiles`, the shipped implementation applies this **default per-worker
heap bound**:

```
perWorkerHeapLimit = clamp(
  floor(os.totalmem() * 0.25),
  768 MB,
  1.5 GB,
)
```

The hot pool implements its own `memoryLimit` recycling (custom pools don't receive
Vitest's vm-only `task.memoryLimit`). The next iteration must turn this into a real
worker-total bound: read the cgroup/container limit, reserve headroom for the main
process, divide the remaining budget by effective worker count, cap worker count
when the per-worker floor engages, and recycle on RSS as well as V8 heap. Until
then, `workers * perWorkerHeapLimit` can exceed the intended machine budget.

The input side is now experimentally settled. In Docker cgroup v2 on the minimum
Node line (20.20.2), `process.constrainedMemory()` exactly reported 512 MiB, 1 GiB
and 2 GiB limits while `os.totalmem()` reported the 11.7 GiB VM host. The candidate
planner chose the constrained value and 1/1/4 automatic workers. Production still
uses the transitional formula above; the remaining gate is full RN recycle/OOM
behavior under those limits, not how to discover the ceiling.

**Single-worker is the residual unsafe case.** Recycling can't fire when Vitest
batches all files into one task (`isolate:false` + `maxWorkers:1`). So when hot is
enabled and workers resolve to 1, the bound is inert — keep the existing one-time
warning (already shipped) and document "run ≥2 workers for bounded hot memory."
Do **not** silently rewrite the user's `maxWorkers`.

## Layer 2 — `hotRuntime: 'auto'`

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

- Single-worker hot with a memory bound set → the existing "recycling INACTIVE"
  warning (PR #55), reworded to mention the unbounded-memory risk and recommend
  ≥2 workers.
- `'auto'` that declines to enable hot → a one-line diagnostic explaining why
  (jest-compat detected / single worker / low memory), so it isn't a silent no-op.

## Open questions

1. Validate the candidate 80% soft / 90% hard RSS envelope and reserves with the
   packed RN scale fixture across common Linux CI/container shapes.
2. Reuse an upstream full module-isolation API if it lands. It removes the custom
   worker/private module-reset path; a thin memory-aware pool may still be required.

## Rollout sequence

1. **Layer 1 (bounded hot)** — shipped with a transitional per-worker heap threshold;
   finish cgroup-aware worker-total/RSS budgeting and recyclable one-worker tasks.
2. **Layer 2 (`'auto'`)** — opt greenfield projects in safely.
3. **Layer 3 (default flip)** — only with the gating evidence above.
