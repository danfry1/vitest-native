# What is vitest-native

vitest-native runs your React Native tests under [Vitest](https://vitest.dev), against **real React Native** — the same JavaScript that ships in your app — mocking only the native-module boundary. That's the zero-config default. A fast pure-JS **mock** engine is available as an opt-in for RN-free unit tests. One plugin gives you both.

It is the maintained successor to [`vitest-community/vitest-react-native`](https://github.com/vitest-community/vitest-react-native) — same core idea (externalize React Native, run its real JS under Node), rebuilt for modern Vitest (v4).

## The idea

React Native's JavaScript is a thin layer over native code that doesn't exist in Node. So to run RN tests off-device, *something* has to stand in for the native side. There are two ways to do that, and vitest-native gives you both behind one plugin:

- **`engine: 'native'`** *(default)* — runs **real React Native** JS, mocking only the thin native boundary (native modules, `UIManager`, and the native host-component registry — *not* the `View`/`Text`/`ScrollView` component JS, which runs for real). Jest's preset mocks a superset (it also swaps RN's core components for stand-ins), so the native engine has higher fidelity for accessibility, RN-API behavior, integration, and avoiding mock drift. This is what `reactNative()` gives you.
- **`engine: 'mock'`** — a fast, zero-dependency pure-JS reimplementation of React Native. The opt-in escape hatch for pure-logic suites, environment control, and maximum determinism.

Both engines share the same test API — [`@testing-library/react-native`](https://callstack.github.io/react-native-testing-library/) (RNTL), the [test helpers](/guide/helpers), and the [presets](/guide/presets) all work the same either way.

## When it's the strongest fit

- **You start a new RN project or write new tests** — great DX, zero migration cost.
- **You want real-RN fidelity** that mock-based runners can't give you.
- **You already use Vitest** elsewhere and want one runner across your codebase.
- **You want to adopt incrementally** — write new tests on vitest-native *alongside* your existing Jest suite, and migrate older tests as you touch them.

Migrating a large, deeply Jest-coupled suite *wholesale* is possible but **not turnkey** — see [Migrating from Jest](/migration/from-jest). In our own testing we've run it against real apps: a fresh test suite against react-native-paper passed cleanly, and we migrated existing Jest suites from the [obytes template](https://github.com/obytes/react-native-template-obytes) and Rocket.Chat. Those were local runs; the reproducible guarantee is the [cross-check](/guide/comparison#the-cross-check).

## What you get

- **Zero config** — the plugin auto-injects setup files and configures RNTL. No manual `setupFiles` needed.
- **Real React Native by default** — `native` runs RN's real JS, mocking only the native boundary; the opt-in `mock` engine is a fast pure-JS reimplementation for when you want no RN at all.
- **Single package** — one install replaces three.
- **Same toolchain as RN** — `native` Flow-strips real React Native via your project's Babel preset, the toolchain RN already uses. The `mock` engine needs no Babel — it's just Vite.
- **100% public API coverage** (mock engine) — every stable React Native export is mocked. See [API Coverage](/api/coverage).
- **RNTL compatible** — works with `@testing-library/react-native` automatically.
- **Third-party presets** — auto-detected mocks for Reanimated, Gesture Handler, Safe Area, Navigation, Screens, AsyncStorage, Device Info, MMKV, SVG, WebView, and Expo.
- **jest-compat layer** — `vitest-native/jest-compat` eases migrating existing Jest suites.
- **Test helpers** — `setPlatform`, `setDimensions`, `setColorScheme`, `mockNativeModule` for easy state control.
- **TypeScript first** — full type safety across the entire API.

::: tip Beta
A CI-gated behavioral cross-check runs the same assertions under the mock engine and real React Native across React Native 0.81–0.85, failing the build on any divergence. Some APIs may still shift before 1.0.
:::

Next: [Installation](/guide/install) → [Quick Start](/guide/quick-start).
