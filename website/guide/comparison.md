# Comparison with Jest

Jest with `@react-native/jest-preset` is the React Native standard and works well. This page is an honest account of where vitest-native fits relative to it.

## When to reach for vitest-native

Choose it when you value:

- **Higher-fidelity option** — Both Jest's RN preset and vitest-native run real RN JS and mock the native side, but at different boundaries (see [below](#where-the-mock-boundary-sits)). Jest replaces RN's core components and a few APIs with passthrough mocks; vitest-native's `engine: 'native'` mocks only the deeper native boundary, so your tests run RN's *real* component JS. And you can still drop to a fast full mock when you don't need that.
- **DX** — Vitest's watch mode, UI, and native ESM tooling.
- **Unification** — one runner if you also test web or server code with Vitest.

## Where the mock boundary sits

The biggest misconception is that Jest "doesn't run real React Native." It does — Jest with `@react-native/jest-preset` runs most of RN's real JavaScript (`StyleSheet`, `Platform`, `Pressable`, `Animated`'s JS, and the rest of the library). What it mocks is a specific set:

- **Core components** — `View`, `Text`, `ScrollView`, `TextInput`, `Image`, `Modal` are swapped for simplified passthrough mocks (`react-native/jest/mocks/*`). They render a flat host element named after the component; the real component's render logic doesn't run.
- **Native modules** — `NativeModules`, `UIManager`, `NativeComponentRegistry`, `requireNativeComponent`, `InitializeCore`.
- **A few APIs** — `useColorScheme`, `Vibration`, `Linking`, `AppState`, `Clipboard`.

vitest-native's native engine mocks **only the native boundary** (the native-component registry + native modules) — everything else in RN, including the real `View`/`Text`/`ScrollView` component JS, runs for real. That's why a native-engine render produces real host names (`RCTView`, `RCTText`) where Jest's preset shows mock names (`View`, `Text`).

So the difference is **where the boundary sits**, not "real vs mocked." vitest-native's `native` engine sits lower, which means higher fidelity for component behavior, accessibility, and text nesting — at the cost of running more of RN's real code.

| | Jest + RN preset | vitest-native `native` |
|---|---|---|
| Runs real RN JS | Yes (most of it) | Yes |
| Core components (`View`/`Text`/…) | Mocked (passthrough) | **Real** |
| Native modules / host components | Mocked | Mocked |
| Rendered host names | `View`, `Text` | `RCTView`, `RCTText` |

## It is not primarily a speed play

With `engine: 'native'` and isolation on, vitest-native isn't categorically faster than Jest today. Choose it for the **fidelity option and DX** — not raw speed. If a marketing page tells you a real-RN runner is dramatically faster than Jest, be skeptical; this one won't.

## At a glance

|  | vitest-native | Jest + `@react-native/jest-preset` |
|---|---|---|
| Mock boundary | Native boundary only (real component JS), or full mock — your choice | Core components + native boundary mocked |
| Runner | Vitest 4.x / 5.x | Jest |
| Config | One plugin, zero setup | jest-preset + transformIgnorePatterns |
| Watch / UI | Vitest watch + UI | Jest watch |
| ESM | Native | Via transforms |
| Web/server code | Same runner | Separate runner |
| Maturity | Beta | Mature standard |

## The cross-check

The mock engine is a reimplementation of React Native, so it could in principle drift from real RN behavior. vitest-native guards against that with a **CI-gated behavioral cross-check**: a corpus of probes runs the same assertions against both the mock engine and real RN across React Native 0.81–0.86, and divergences fail CI. It's reproducible — clone the repo and run `bun run crosscheck`. The full corpus and its current pass count are published in the [Fidelity Report](/guide/fidelity).

This is the trust mechanism for the mock — and it has already caught and fixed real mock bugs (for example, an `Animated.Text` host-name mismatch that broke `queryByText`, and `Animated.Value`-in-style not resolving for `toHaveStyle`). The native engine doesn't need this — it *is* real RN.

## Migrating

- **New tests** are a drop-in — zero migration cost.
- **An existing, deeply Jest-coupled suite** is incremental, not turnkey. The [jest-compat layer](/guide/jest-compat) clears the mechanical API coupling; the rest is small, well-defined per-suite cleanup. See [Migrating from Jest](/migration/from-jest).
- Coming from the unmaintained `vitest-react-native` plugin? That's a [config swap](/migration/from-vitest-react-native).
