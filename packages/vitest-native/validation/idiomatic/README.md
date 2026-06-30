# Idiomatic validation oracle

A vitest-first React Native app suite that represents how a **normal app** uses
vitest-native — host-element queries, `userEvent`, real `Animated`, Context,
`FlatList`, `Switch`, real listener hooks — with **no `jest-compat` and no
resident monkeypatching**. It exists to validate hot-runtime correctness against
a representative oracle, instead of relying only on migrated Jest suites (which
do non-idiomatic things a fresh vitest app never would).

## What is actually proven (and how)

The load-bearing evidence is **parity**: the same suite produces identical
per-test results under the default engine and under hot. On top of that, two
**order-independent cross-file probes** are demonstrated *sensitive* by a negative
control (they FAIL when there is no per-file reset, and PASS under hot):

- **Module-level store reset** (`store-*.test.tsx`, and the `store` template at
  scale): each file asserts the shared store starts at 0, then mutates it.
  Whichever file runs second fails if the mutation survived — no reliance on file
  order.
- **Resident RN surface reset** (`bleed-surfaces-*.test.tsx`): each file asserts
  `Dimensions`, `Appearance`, `process.env`, a `globalThis` key, and a
  `DeviceEventEmitter` listener count are all clean, then pollutes them. Same
  symmetric, order-independent design — so the listener surface is covered here.

Both probes work the same way: whichever file runs second fails under no-reset
(deterministic, independent of which file Vitest schedules first), and both pass
under hot.

Surfaces / probes *not* claimed as proof: RNTL's render tree is cleaned by RNTL's
own intra-file `afterEach` regardless of the per-file reset; Vitest resets fake
timers per file regardless; and the scale suite's `listenerCount`-accumulation
checker is order/cleanup-timing dependent (it does not reliably fail the negative
control). These are exercised but not presented as sensitivity probes.

## Hand-written suite + mini-app

```sh
node node_modules/.bin/vitest run --config validation/idiomatic/vitest.default.mts
node node_modules/.bin/vitest run --config validation/idiomatic/vitest.hot.mts
node node_modules/.bin/vitest run --config validation/idiomatic/vitest.noisolate.mts  # negative control
```

The `app/` directory + `app-*.test.tsx` add a cohesive mini-app with the patterns
isolated components don't exercise: a hand-rolled stack **navigator** (push/pop +
params), **async data fetching** (loading/data/error), **nested providers**
(auth/theme/settings consumed deep), and an **error boundary**. hot == default
here too (21/21 both engines; the negative control fails the two sensitive probes).

## Scale suite (`scale/`)

`run-compare.mjs` generates a large, diverse suite from resident-state-touching
templates (with interleaved listener-accumulation probes), runs it under both
engines, and **diffs per-test results** — any test passing under default but
failing under hot is a hot-specific regression (it also asserts both runs exited
0 and ran the same test count). This is the **automated** parity check.

```sh
bun run validate:hot-parity 120        # single-worker compare + diff
VN_WORKERS=4 bun run validate:hot-parity 120   # multi-worker compare + diff
```

`scale/vitest.noisolate.mts` is the **negative control** (native `isolate:false`,
no per-file reset): the store and listener-accumulation probes FAIL there,
demonstrating they detect real cross-file bleed; the same probes pass under hot.

> Scope: `validate:hot-parity` is the automated diff over the generated scale
> suite. The hand-written suite + mini-app are validated via the commands above
> (manual snapshot), not yet wired into CI.

## Results (2026-06-30, RN 0.86)

**Correctness** — hot == default, zero per-test delta:
- Scale, single-worker: 135/135 both; 1000-file run 1125/1125.
- Scale, multi-worker (`VN_WORKERS=4`): 135/135 both.
- Hand-written + mini-app: 21/21 both.
- Negative control (`isolate:false`, no reset): the order-independent sensitive
  probes FAIL (the second file to run) — the store probe (consistently, ~14× at
  scale) and the hand-written resident-surface probe — plus collateral breakage
  from the missing reset. The same probes pass under hot.

**Speed** — hot is faster, but compare at the engine's *own* parallelism:
- 4 workers (default's realistic config), 120 files: default 9.3s vs hot 0.9s
  → **~10×**.
- 1 worker, 135 files: default 43.7s vs hot 3.1s → ~14× (a worst-case baseline;
  nobody runs the default engine single-worker).

**Memory** — a real speed/memory tradeoff, not a free win:
- Single-worker hot accumulates ~4 MB/file, **unbounded** (1010 MB @150 → 2466 MB
  @500). Idiomatic auto-cleanup does NOT mitigate it.
- Multi-worker + recycling (`hotRuntime: { recycleAfterFiles: 40 }`) **bounds** it
  flat: 1523 MB @500 files, 1559 MB @1000.
- But that bound is ~1.8× the default engine (836 MB @500/4w), because each worker
  holds React Native resident.
- Implication: defaulting hot must pair with multi-worker + a recycle/memory bound
  + likely a worker-count cap; on memory-constrained CI the default engine may
  still be preferable. See `docs/hot-default-design.md`.

Conclusion: on idiomatic/greenfield apps the hot runtime is correctness-identical
to the default engine and substantially faster, at a bounded memory cost. Migrated
Jest suites can still hit migration-tooling friction — a separate concern.

Measure memory with `/usr/bin/time -l node node_modules/.bin/vitest run --config
<config>` after `node scale/generate.mjs <N>`.
