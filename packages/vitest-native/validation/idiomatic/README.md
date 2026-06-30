# Idiomatic validation oracle

A vitest-first React Native app suite that represents how a **normal app** uses
vitest-native — host-element queries, `userEvent`, real `Animated`, Context,
`FlatList`, `Switch`, real listener/timer hooks — with **no `jest-compat` and no
resident monkeypatching**. It exists to validate hot-runtime correctness against
a representative oracle, instead of relying only on migrated Jest suites (which
do non-idiomatic things a fresh vitest app never would).

## Hand-written suite

Run the same suite under both engines and compare:

```sh
node node_modules/.bin/vitest run --config validation/idiomatic/vitest.default.mts
node node_modules/.bin/vitest run --config validation/idiomatic/vitest.hot.mts
```

Alongside realistic components it includes **adversarial cross-file bleed
probes** (paired files): one pollutes a resident surface, the next asserts it was
reset — covering the RNTL render tree, DeviceEventEmitter listeners, Dimensions,
Appearance, `process.env`, `globalThis`, a module-level store, and fake timers.

## Scale suite (`scale/`)

`run-compare.mjs` generates a large, diverse suite from resident-state-touching
templates (with interleaved listener-accumulation probes), runs it under both
engines, and **diffs per-test results** — any test that passes under default but
fails under hot is a hot-specific regression.

```sh
bun run validate:hot-parity 120   # generate 120 files, run default vs hot, diff
```

`vitest.noisolate.mts` is the **negative control**: native `isolate:false` with
no per-file reset. The store/listener probes are expected to FAIL there, proving
they actually detect cross-file bleed — the same probes pass under hot.

## Result (2026-06-30, RN 0.86, 135 generated files)

- default `isolate:true`: 135/135
- **hot: 135/135, ~14× faster** (3.1s vs 43.7s), zero correctness delta
- negative control `isolate:false`: 12 failures (probe sensitivity confirmed)

Conclusion: on idiomatic/greenfield apps at scale, the hot runtime is
correctness-identical to the default engine and substantially faster. Migrated
Jest suites can still hit migration-tooling friction — a separate concern.

## De-risking the default flip (2026-06-30)

- **Correctness** — solid. hot == default at single-worker AND multi-worker
  (`VN_WORKERS=4`), from 135 up to 1000 generated files, zero per-test delta.
  The negative control proves the bleed probes are sensitive.
- **Memory** — a real speed/memory tradeoff, not a free win.
  - Single-worker hot accumulates ~4 MB/file, **unbounded** (1010 MB @150 →
    2466 MB @500). Idiomatic auto-cleanup does NOT mitigate it.
  - Multi-worker + recycling (`hotRuntime: { recycleAfterFiles: 40 }`) **bounds**
    it flat: 1523 MB @500 files, 1559 MB @1000 files.
  - But that bound is still ~1.8× the default engine (836 MB @500/4w), because
    each worker holds React Native's resident graph.
  - Implication for defaulting hot: it must pair with multi-worker + a recycle /
    memory bound, and likely a worker-count cap; on memory-constrained CI the
    default engine may still be preferable.

Run the memory measurements with `/usr/bin/time -l node node_modules/.bin/vitest
run --config <config>` after `node scale/generate.mjs <N>`.
