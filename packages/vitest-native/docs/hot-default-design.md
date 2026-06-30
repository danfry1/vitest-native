# Design: hot runtime as a safe default for greenfield apps

**Status:** Design proposal (not yet implemented)
**Basis:** the idiomatic hot-parity validation + default-flip de-risk (`validation/idiomatic/`)

## What the data established

- **Correctness is not the blocker.** On idiomatic vitest-first apps, hot is
  correctness-identical to the default engine — single- and multi-worker, 135→1000
  files, with a negative control proving the cross-file bleed probes are sensitive.
  The old "hot can't be default because of state bleed" framing is dead for the
  greenfield audience.
- **Memory is the real constraint, and it's a tradeoff.**
  - Single-worker hot accumulates **~4 MB/file, unbounded** (2466 MB @500 files).
    Recycling cannot fire single-worker (Vitest batches all files into one task),
    so this case is structurally unsafe at large scale.
  - Multi-worker + recycling **bounds it flat** (~1.5 GB @500–1000 files) but at
    ~1.8× the default engine, because each worker holds React Native resident.
- **Migration suites are out of scope.** hot is *not* clean for jest-compat
  suites (the paper bake-off); that's a migration-tooling problem, separate from
  the engine.

So the question is no longer *whether* hot is correct enough to default — it is —
but *how* to default it without the memory footgun or breaking migration suites.

## Design principles

1. **Safe when enabled.** Turning hot on must never silently grow unbounded.
   Today `hotRuntime: true` on a single worker leaks with only a warning.
2. **Opt-in escalation.** Don't flip the global default for everyone in one step.
   Make hot *safe to enable*, then *auto-enable where provably safe*, then
   (much later, with real-world data) consider the global default.
3. **Honest fallbacks.** Where hot can't be made safe (single-worker large, or
   jest-compat suites), fall back or warn — never pretend.

## Layer 1 — Bounded hot (safe defaults when `hotRuntime` is enabled)

When `hotRuntime` is truthy and the user has NOT set an explicit `memoryLimit` /
`recycleAfterFiles`, apply a **default per-worker memory bound** so total hot
memory is bounded regardless of worker count:

```
perWorkerMemoryLimit = clamp(
  floor(MEMORY_BUDGET_FRACTION * os.totalmem() / effectiveWorkers),
  MIN_PER_WORKER,   // 512 MB — below this, recycling thrashes
  MAX_PER_WORKER,   // 2 GB   — above this, no point bounding
)
// MEMORY_BUDGET_FRACTION = 0.6  (total hot RSS targets ~60% of system memory)
```

The hot pool already implements its own `memoryLimit` recycling (custom pools
don't receive Vitest's vm-only `task.memoryLimit`), so this is wiring a default,
not new machinery. Because the budget is divided by worker count, **total memory
stays bounded as workers scale** (8 workers each recycle at budget/8), which is
cleaner than capping the worker count.

**Single-worker is the residual unsafe case.** Recycling can't fire when Vitest
batches all files into one task (`isolate:false` + `maxWorkers:1`). So when hot is
enabled and workers resolve to 1, the bound is inert — keep the existing one-time
warning (already shipped) and document "run ≥2 workers for bounded hot memory."
Do **not** silently rewrite the user's `maxWorkers`.

## Layer 2 — `hotRuntime: 'auto'`

A third value that enables hot only when it is both *safe* and *beneficial*:

```ts
reactNative({ engine: "native", hotRuntime: "auto" })
```

Enable hot when ALL hold (else fall back to the default per-file engine):

- **Not a migration suite.** No `jestMockTransform` plugin and no jest-compat
  setup file present (inspect the resolved Vite config in `configResolved`). hot
  isn't clean for jest-compat patterns, so don't auto-enable there.
- **Multi-worker.** Resolved `maxWorkers >= 2` (so recycling can bound memory).
- **Enough headroom.** `os.totalmem()` comfortably exceeds
  `effectiveWorkers * RN_RESIDENT_ESTIMATE` (~600 MB/worker).

Suite size (hot's win amortizes over many files) is only known after collection,
so `'auto'` keys on config-time signals; a tiny suite still works under hot, just
without a speed win — acceptable.

## Layer 3 — global default flip (future, gated)

Only after `'auto'` has real-world mileage would we consider making `'auto'` the
default for the native engine. Gating evidence: a real greenfield app validated,
memory behavior confirmed across CI shapes, and the migration story handled. Not
part of this proposal.

## Memory model (the math we are bounding)

| config | peak RSS @500 files | bounded? |
| --- | --- | --- |
| default (isolate:true), 4w | 836 MB | yes (recreates per file) |
| hot, 1 worker | 2466 MB | **no** (unbounded, ~4 MB/file) |
| hot + recycle, 4w | 1523 MB | yes (flat to 1000 files) |

Layer 1 makes the bounded row the out-of-the-box behavior whenever workers ≥ 2.

## Guardrails & warnings

- Single-worker hot with a memory bound set → the existing "recycling INACTIVE"
  warning (PR #55), reworded to mention the unbounded-memory risk and recommend
  ≥2 workers.
- `'auto'` that declines to enable hot → a one-line diagnostic explaining why
  (jest-compat detected / single worker / low memory), so it isn't a silent no-op.

## Open questions

1. `MEMORY_BUDGET_FRACTION` — 0.6 is a guess; validate against CI shapes
   (2-core/8 GB GitHub runners, memory-constrained containers).
2. Should `'auto'` also consider `process.env.CI` memory limits (cgroup limits)
   rather than `os.totalmem()`? Containerized CI often has less than the host.
3. Reuse the upstream `isolate: 'modules'` work if it lands — it would remove the
   custom-pool hacks underneath all of this.

## Rollout sequence

1. **Layer 1 (bounded hot)** — low risk, high value; makes hot safe to enable for
   anyone today. Ship first.
2. **Layer 2 (`'auto'`)** — opt greenfield projects in safely.
3. **Layer 3 (default flip)** — only with the gating evidence above.
