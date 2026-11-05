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

The native engine compiles React Native once, on the first run, in a separate short-lived process, and caches the result on disk; later runs reuse it ([where it lives and when it is rebuilt](/guide/troubleshooting#when-react-native-s-precompiled-modules-are-reused-or-rebuilt)). If that compilation fails, the engine loads React Native module by module instead, more slowly, with the same results.

## Keeping the mock honest

Because the mock is a reimplementation, it could drift from real RN behavior. A **CI-gated behavioral cross-check** runs the same assertions against both the mock and real RN across React Native 0.81–0.88, so divergences are caught before release. See [Comparison with Jest](/guide/comparison#the-cross-check) for how that trust mechanism works.

## Hot runtime

By default the native engine runs each test file in a fresh worker. The opt-in [hot runtime](/guide/hot-runtime) (`hotRuntime: 'auto'`) keeps workers alive across files instead, so React Native loads once per worker while each file still gets fresh app and test modules. It is experimental and has known differences from per-file isolation; the [Hot Runtime](/guide/hot-runtime) page covers when to try it, how it falls back, and its workers and memory.

Next: [How It Works](/guide/how-it-works) explains what the plugin does under the hood.
