# Choosing an Engine

vitest-native ships **two engines behind one plugin**, so you choose the fidelity each suite needs. This is the core idea of the project — pick real-RN fidelity or a fast mock per suite, without changing test runners.

## The two engines

```ts
reactNative()                      // default — real React Native (native), when its babel deps are present
reactNative({ engine: 'native' })  // force real React Native; mock only the native boundary
reactNative({ engine: 'mock' })    // opt in to the fast pure-JS mock
reactNative({ engine: 'auto' })    // the default — native when available, else mock (with a one-line notice)
```

`reactNative()` with no options resolves to **native** whenever `@react-native/babel-preset` and `@babel/core` are present (i.e. any real RN app), falling back to `mock` only when they're absent.

## `engine: 'native'` — real React Native

Runs **real React Native** JavaScript — the same code that ships in your app — and mocks only the thin native boundary (native modules, `UIManager`, and the native host-component registry; the `View`/`Text`/`ScrollView` component JS runs for real). Jest's preset mocks a superset of this — see [where the boundary sits](/guide/comparison#where-the-mock-boundary-sits).

**Reach for it when you want:**

- **Fidelity** — accessibility behavior, RN-API semantics, and component internals that a mock can drift away from.
- **Integration confidence** — testing how your components actually compose with real RN.
- **No mock drift** — you're testing RN itself, not a reimplementation of it.

It Flow-strips real React Native through your project's Babel preset — the toolchain RN already uses — so it needs `@react-native/babel-preset` + `@babel/core` (present in every RN app).

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
| Babel | `@react-native/babel-preset` + `@babel/core` | None |
| Best for | Fidelity, integration, accessibility | Pure logic, environment control, determinism |
| Test API | RNTL, helpers, presets | RNTL, helpers, presets |

Both engines share the same test API. You can mix them across suites in the same project.

## Keeping the mock honest

Because the mock is a reimplementation, it could drift from real RN behavior. A **CI-gated behavioral cross-check** runs the same assertions against both the mock and real RN across React Native 0.81–0.87, so divergences are caught before release. See [Comparison with Jest](/guide/comparison#the-cross-check) for how that trust mechanism works.

## Hot runtime (experimental)

By default the native engine re-instantiates React Native for every test file (Vitest's standard per-file isolation). On large suites that per-file tax dominates the run. The opt-in **hot runtime** keeps React Native warm across files in a persistent worker while still resetting app/test modules and common process-wide pollution between files:

```ts
reactNative({ hotRuntime: true })
```

It uses Vitest's custom worker APIs and remains experimental.

### When it helps

On large, render-heavy suites it removes most of the per-file React Native re-instantiation cost — in internal benchmarks roughly a 12× reduction in import/setup time at 100 files. The bigger the suite and the more of its time goes to loading React Native, the larger the win.

### Known limitation: resident-state bleed

Because React Native stays resident across files within a worker, **state held in React Native's own internal modules is not reset between files** — only app/test modules, listeners, globals, `process.env`, and `Dimensions`/`Appearance` are. The per-file reset deliberately does not reach into third-party or RN-internal module internals, because doing so generically is unsafe (it can unmount or corrupt state later files still depend on).

In practice this means a suite that leans on **deep resident-RN-internal state** can see cross-file interference under the hot runtime that it would not see under the default per-file isolation. The clearest example is heavy `Animated` usage: animations driven in one file can mutate React Native's resident `Animated` bookkeeping in a way that alters how a later file renders, producing output a snapshot taken under the default engine won't match.

A tell-tale sign is **a test that passes in isolation but fails when run after other files**. If you see that under `hotRuntime: true`, move that suite (or the project) back to the default engine — correctness comes first.

This is why the hot runtime is **opt-in and experimental, not the default**. It is best suited to large suites whose cost is dominated by loading React Native rather than by deep resident-RN-internal state. Closing the gap for all suites requires per-file module reset inside a persistent worker, which depends on an upstream Vitest capability that does not exist yet.

### Worker recycling

The hot runtime automatically derives a worker-total budget from the lower of host and container/cgroup memory. It reserves main-process and replacement headroom, caps automatic concurrency at four, recycles workers on local heap or process RSS, and stops before starting more work at the hard RSS boundary. Use `diagnostics: true` or `vitest-native doctor` to inspect the plan.

Recycling only fires with **two or more workers** under current Vitest. In single-worker mode Vitest batches every file into one task and never exposes a recycle boundary, so the plugin now fails that configuration instead of silently trusting an inert limit. Use `maxWorkers >= 2` or the default runtime. If an external scheduler already enforces the process boundary, `hotRuntime: { allowUnboundedMemory: true }` explicitly accepts the risk and disables the automatic worker cap and process-RSS enforcement.

Next: [How It Works](/guide/how-it-works) explains what the plugin does under the hood.
