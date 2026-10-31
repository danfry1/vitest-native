# Choosing an Engine

vitest-native ships **two engines behind one plugin**, so you choose the fidelity each suite needs. This is the core idea of the project — pick real-RN fidelity or a fast mock per suite, without changing test runners.

## The two engines

```ts
reactNative()                      // default — real React Native (native), when its babel deps are present
reactNative({ engine: 'native' })  // force real React Native; mock only the native boundary
reactNative({ engine: 'mock' })    // opt in to the fast pure-JS mock
reactNative({ engine: 'auto' })    // the default — native when available, else mock (with a one-line notice)
```

`reactNative()` with no options resolves to **native** whenever a React Native Babel preset (`@react-native/babel-preset`, or Expo's from SDK 56) and `@babel/core` are present (i.e. any real RN or Expo app), falling back to `mock` only when they're absent.

## `engine: 'native'` — real React Native

Runs **real React Native** JavaScript — the same code that ships in your app — and mocks only the thin native boundary (native modules, `UIManager`, and the native host-component registry; the `View`/`Text`/`ScrollView` component JS runs for real). Jest's preset mocks a superset of this — see [where the boundary sits](/guide/comparison#where-the-mock-boundary-sits).

**Reach for it when you want:**

- **Fidelity** — accessibility behavior, RN-API semantics, and component internals that a mock can drift away from.
- **Integration confidence** — testing how your components actually compose with real RN.
- **No mock drift** — you're testing RN itself, not a reimplementation of it.

It Flow-strips real React Native through your project's Babel preset — the toolchain RN already uses — so it needs `@react-native/babel-preset` + `@babel/core` (present in every RN app). From Expo SDK 56, whose `babel-preset-expo` no longer depends on the React Native preset, it compiles with Expo's preset (`expo/internal/babel-preset`), as Expo's Metro and jest-expo do.

## `engine: 'mock'` — fast pure-JS

A fast, zero-dependency pure-JS reimplementation of React Native. Mocks *all* of React Native.

**Reach for it when you want:**

- **Pure-logic suites** — testing reducers, hooks, and view logic where you don't need real RN.
- **Environment control** — full control over platform, dimensions, color scheme, and native modules.
- **Maximum determinism** — no real RN internals, no Babel, just Vite.

The mock engine covers [100% of React Native's stable public API](/api/coverage) and needs no Babel.

## Side by side

|  | `engine: 'native'` *(default)* | `engine: 'mock'` |
|---|---|---|
| What runs | **Real React Native** JS | Fast pure-JS reimplementation |
| Mocks | Only the native boundary | All of React Native |
| Fidelity | Highest | High, but a reimplementation |
| Babel | `@react-native/babel-preset` (or Expo's, SDK 56+) + `@babel/core` | None |
| Best for | Fidelity, integration, accessibility | Pure logic, environment control, determinism |
| Test API | RNTL, helpers, presets | RNTL, helpers, presets |

Both engines share the same test API. You can mix them across suites in the same project.

The native engine's first cold run compiles React Native's CommonJS graph into a factory registry
inside a short-lived, heap-bounded child process. That process exits before test workers start,
reclaiming Babel's compiler heap; warm runs validate and reuse the disk cache without spawning it.
If compilation fails, the engine reports the slower per-file fallback and preserves correctness.

## Keeping the mock honest

Because the mock is a reimplementation, it could drift from real RN behavior. A **CI-gated behavioral cross-check** runs the same assertions against both the mock and real RN across React Native 0.81–0.88, so divergences are caught before release. See [Comparison with Jest](/guide/comparison#the-cross-check) for how that trust mechanism works.

## Hot runtime

Vitest's standard per-file worker isolation reloads React Native for every file, and on large suites that worker and module-loading tax dominates the run. The **hot runtime** keeps a precompiled React Native factory registry and worker realm warm while resetting RN module instances, app/test modules, and supported process-wide state between files. It is opt-in (`hotRuntime: 'auto'`); the default, `hotRuntime: false`, gives each file a fresh worker, as in 0.13.0. With `'auto'` it runs wherever the run can be bounded and recycled, and falls back to per-file isolation otherwise, printing the reason. It has [known differences](/guide/troubleshooting#a-test-passes-on-its-own-but-fails-when-run-with-other-files) from per-file isolation:

```ts
reactNative({ hotRuntime: false }) // always isolate per worker
reactNative({ hotRuntime: true })  // require hot; fail if it cannot be bounded
```

It uses Vitest's custom worker APIs, which Vitest labels experimental.

### Choosing the hot runtime

Turn it on when a suite is large enough that loading React Native in every file dominates the run, and the suite passes the same way with and without it. On the repository's generated benchmark suite it ran 1.79× faster than Jest at 50 files and 2.66× at 200, where per-file isolation ran at 0.47× and 0.34× (the README has the table and the conditions). Treat those as indicative and measure your own suite with both settings.

What it changes: workers stay alive across test files, so React Native loads once per worker instead of once per file. Your app and test modules, mocks, timers and a verified list of process-wide state are still reset per file. Some state is known to carry over, and each case shows up as a test that passes alone but fails after other files: generated `useId` values, React's once-per-worker development warnings, an un-awaited `act()`, fake timers captured by React's scheduler, and fake timers RNTL reinstalls only once. [Troubleshooting](/guide/troubleshooting#a-test-passes-on-its-own-but-fails-when-run-with-other-files) describes each one and how to confirm it.

It is opt-in because those differences can change a test's result depending on file order. It can become the default again once:

- each known difference is closed, or detected and reported against the file that caused it;
- real-app suites pass the same way with and without it across the supported Vitest and RNTL versions;
- it has shipped as the recommended opt-in for a stable minor release with no open hot-only defect that can make a test pass wrongly.

### When it helps

On large, render-heavy suites it removes most filesystem, transform, compilation, and worker-start cost — in internal benchmarks roughly a 12× reduction in import/setup time at 100 files. The bigger the suite and the more of its time goes to loading React Native, the larger the win.

### State restoration and its boundary

Normal hot mode resets React Native's in-memory registry instances per file. An ordered state manifest then restores and verifies timers/Vitest stubs, native-boundary overrides, environment, process/RN listeners, global and console descriptors, known RN state, ErrorUtils, and the Expo compatibility runtime. CI mutation testing disables every restore action in turn and requires the isolation suite to fail by the responsible entry.

This is not a promise to discover arbitrary mutable state in every resident third-party singleton. Unknown process-wide state remains the library's or fixture's responsibility.

A tell-tale sign is **a test that passes in isolation but fails when run after other files**. If you see that, set `hotRuntime: false` for that suite (or the project) — correctness comes first — and report the reproduction.

The runtime relies on Vitest's custom pool/worker APIs. The proposed upstream module-isolation primitive would remove those private seams; it is not required for the current correctness model.

### Compile cache

Under the native engine, vitest-native turns on Node's on-disk V8 compile cache (`node_modules/.cache/vitest-native/v8`) so React Native's bytecode is reused by later workers and runs. Hot workers leave it off while ESM generation is on, which is the default under the hot runtime: each test file re-evaluates the ES packages it imports under a new URL, and the cache would keep one entry per module per file. Leaving it off cost about 15–20 ms per hot worker boot in one measured fixture, including each recycle. With `hotRuntime: { esmGeneration: false }`, hot workers keep the cache.

If you set `NODE_COMPILE_CACHE` yourself, Node turns the cache on in every worker before vitest-native runs, and hot workers with ESM generation then write those per-file entries again. Unset it for hot runs, or set `esmGeneration: false`.

### Worker recycling

The hot runtime automatically derives a worker-total budget from the lower of host and container/cgroup memory. It reserves main-process and replacement headroom, caps automatic concurrency at four, recycles workers on local heap or process RSS, and stops before starting more work at the hard RSS boundary. Use `diagnostics: true` or `vitest-native doctor` to inspect the plan.

The cap of four applies only to the worker count vitest-native picks itself; in the measurement behind it, eight workers were about 6% faster than four for about 512 MiB more peak memory. A count you set — `test.maxWorkers` in the config, `--maxWorkers` on the command line, or `VITEST_MAX_WORKERS` — is honoured up to what the memory budget holds, so setting one is how to run more than four hot workers. Where no memory limit can be read, the cap of four applies to an explicit count too.

Recycling only fires with **two or more workers** under current Vitest. In single-worker mode Vitest batches every file into one task and never exposes a recycle boundary, so `'auto'` keeps per-file isolation there and `hotRuntime: true` fails that configuration instead of silently trusting an inert limit. Use `maxWorkers >= 2` for hot mode. If an external scheduler already enforces the process boundary, `hotRuntime: { allowUnboundedMemory: true }` explicitly accepts the risk and disables the automatic worker cap and process-RSS enforcement.

Next: [How It Works](/guide/how-it-works) explains what the plugin does under the hood.
