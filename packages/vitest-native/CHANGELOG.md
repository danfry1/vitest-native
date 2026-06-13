# vitest-native

## 0.5.0

### Native engine

- Propagate the configured iOS/Android platform through native resolution,
  transformation caches, Babel caller metadata, and native boundary constants.
- Bring assets, helper controls, native-module injection, animated matchers, and
  snapshot serialization to the native engine contract.
- Reject mock-only `mocks` overrides under the native engine instead of silently
  ignoring them.

### Mock engine

- Block `onPress` on disabled `Pressable`/`Touchable*`/`Button` under
  `@testing-library/react-native` v14. RNTL 14 resolves press handlers by walking
  the composite fiber, which re-finds `onPress` on the wrapping `forwardRef` mock,
  so the earlier host-prop stripping no longer blocked the press; disabled hosts
  are now marked `pointerEvents: "none"` so RNTL's `isEventEnabled` rejects it
  (no-op under RNTL ≤13). Thanks @jakeboone02.
- Stop passing the `hostComponentNames` option to `configure()` on RNTL ≥14,
  which removed it in favor of auto-detection; this silences an "Unknown
  option(s) passed to configure" warning while preserving the option for
  RNTL ≤13.

### Reliability

- Fix hot-runtime cross-file leaks from import-time globals, direct environment
  mutations, and app-owned RN event listeners.
- Add a dedicated one-worker hot-isolation gate, a generated 100-file soak,
  end-to-end memory-triggered worker recycling, and Android platform-resolution
  coverage.
- Validate plugin and hot-runtime options eagerly with actionable errors.
- Fail configuration for unsupported required Vite, Vitest, and React peers
  instead of continuing after a console error.

### Compatibility and release engineering

- Validate packed release tarballs in bare RN 0.83/RNTL 12, Expo 56/RNTL 13,
  Vite 8 monorepo/RNTL 14, RN 0.86 Android, and a mock-engine RNTL 14 consumer
  (the combination that guards the disabled-press fix above).
- Support Vite 8's Oxc JSX configuration without the deprecated `esbuild`
  option, while retaining Vite 6–7 support.
- Load RNTL matchers across the public, `build`, and `dist` layouts used by
  RNTL 12–14, and expose Vitest's `expect` for RNTL matcher registration without
  enabling all Vitest globals.
- Upgrade the validated baseline to Vitest 4.1.8, RN 0.85.3, and React 19.2,
  with exact peer upper bounds for unsupported future majors.
- Require patched Vite floors (^6.4.2, ^7.3.2, or ^8.0.5) and refresh build
  tooling/transitive resolutions to remove known high-severity advisories.
- Make Linux Node 20/22, macOS, Windows, packed consumers, the example app,
  soak tests, cross-checks, and package export analysis blocking release gates.

## 0.4.1

### Patch Changes

Documentation fixes (the README is consumers' primary reference):

- **Quick Start now runs as written.** It used bare `test()`/`expect()` with no
  import, but the plugin does not enable Vitest globals — copying it produced
  `test is not defined`. Added the `import { test, expect } from 'vitest'` and a
  note on the `globals: true` alternative.
- **Installation** notes the companion dependencies the examples need
  (`@testing-library/react-native`; a real RN app already provides `react-native`
  + `@react-native/babel-preset` + `@babel/core`).
- Corrected the RN-conformance count (118 ported: 115 passing, 3 documented skips).
- "Spiritual successor" → "Maintained successor" wording, with a migration link.

## 0.4.0

**The native engine is now the zero-config default.** `reactNative()` with no
options runs your tests against **real React Native** — the same JavaScript that
ships in your app — mocking only the native-module boundary. The pure-JS mock
engine remains as an explicit opt-in (`engine: 'mock'`). vitest-native positions
itself as the maintained continuation of
[`vitest-community/vitest-react-native`](https://github.com/vitest-community/vitest-react-native).

> Beta. The native engine is validated against real apps (react-native-paper, the
> obytes template, Rocket.Chat) across React Native 0.81–0.84, with a CI-gated
> behavioral cross-check against real RN. Some APIs may still shift before 1.0.

### Breaking Changes

- **`engine: 'auto'` (the default) now resolves to `'native'`** whenever
  `@react-native/babel-preset` and `@babel/core` are present — i.e. in any real RN
  app. It falls back to `'mock'` only when those deps are absent, printing one line
  to explain why. Previously `auto` always resolved to `mock`. Set
  `engine: 'mock'` to keep the old behavior.

### Native engine

- **Boundary hardening.** The native-module stub now honors RN's calling
  conventions it previously broke: callback-style methods invoke the success
  callback instead of hanging (fixes `AccessibilityInfo.*`, `Share.share`), and
  promise-returning methods return a real `Promise` (fixes `Linking.canOpenURL`/
  `openURL`, `Image.prefetch`/`getSize`). Backed by app-shaped stress suites
  (`tests-native/stress*.test.tsx`) as a permanent regression gate.
- **`isolate: true` is the native-engine default** — the safe Vitest default.
  Adversarial testing proved `isolate: false` leaks state across files at scale.
  An opt-in **hot runtime** (`reactNative({ hotRuntime: true })`) reclaims the
  speed safely via surgical per-file reset, for large suites.
- **`transform` allowlist** — extra `node_modules` packages whose untranspiled
  source the native engine should strip (Flow/TS/JSX) as it loads them, for
  third-party RN libraries (analogous to Jest's `transformIgnorePatterns`).
- **Presets apply under the native engine**, shadowing each library's native
  runtime (worklets, native modules) the way Jest does — including transitively
  imported presets — while the surrounding tree renders through real RN.
- **Expo**: the `expo` preset shadows the common Expo modules under the native
  engine (gated proof in `tests-native/expo.test.tsx`).

### Trust & tooling

- **Cross-check** — a CI-gated behavioral differential that runs the same probes
  under `mock` and `native` and diffs them against real RN as the oracle. It is
  how mock fidelity is proven (and it found two of the mock fixes below).
- **Vitest × RN CI matrix** — gates the native engine across RN 0.81–0.84 ×
  Vitest {pinned, latest}, with the latest-Vitest column as a non-blocking canary.
- **Jest migration tooling** — a `vitest-native/jest-compat` entry (the `jest`
  global, `@jest/globals`, jest-native extend-expect) plus auto-hoisting of
  top-level `jest.mock` → `vi.mock` and automatic JSX runtime. Guides:
  `docs/migrating-from-jest.md` and `docs/migrating-from-vitest-react-native.md`.

### Presets & matchers

- `react-native-gesture-handler` preset now exports `Pressable` (mirroring RN's,
  including suppressing press handlers when `disabled`).
- `toHaveAnimatedStyle` / `toHaveAnimatedProps` are auto-registered on `expect()`,
  replacing reanimated's Jest-only `setUpTests()` matchers. Opt into types with
  `"types": ["vitest-native/matchers"]`.
- New presets: `react-native-device-info`, `react-native-mmkv`, `react-native-svg`,
  `react-native-webview`; navigation preset covers drawer/bottom-tabs/elements.

### Mock-engine fidelity fixes

- Disabled `Pressable`/`Touchable` mocks now suppress press handlers.
- `StyleSheet.hairlineWidth` is derived from the pixel ratio (≈`1/3` at scale 3)
  instead of a hardcoded `0.5`, matching real RN.
- `Animated.Value.interpolate()` supports string output ranges (e.g.
  `["0deg", "360deg"]`, `["0%", "100%"]`), preserving the unit/suffix.

## 0.3.0

### Minor Changes

- Add RN conformance test suite — 75 tests ported from React Native's own test suite (Animated, processColor, flattenStyle, Interpolation) to validate mock behavioral parity
- Add Animated orchestration: `sequence` chains via callbacks, `parallel` waits for all, `loop` supports finite/indefinite iterations with `resetBeforeIteration`
- Add Animated value tracking: `timing`/`spring` with an `AnimatedValue` as `toValue` track source changes via listener
- Add Animated.Color, diffClamp tracking, interpolation extrapolate/easing, toJSON support
- Expand reanimated preset: 44 entering/exiting animations, 7 layout transitions, `useAnimatedReaction`, `useAnimatedKeyboard`, `useReducedMotion`, `useFrameCallback`, `makeMutable`, `SharedTransition`, `ReduceMotion`/`KeyboardState` enums
- Add `@react-navigation/drawer` preset with `createDrawerNavigator`
- Add `setInsets()` helper for safe area context testing
- Add inter-test isolation: `resetAllMocks()` now resets AsyncStorage store and safe area insets
- 1136 tests passing across 30 files

## 0.2.1

### Patch Changes

- Add missing `@react-navigation/core` re-exports to navigation preset, including `useNavigationContainerRef`, `useTheme`, `ThemeProvider`, `NavigationIndependentTree`, `useNavigationBuilder`, `BaseRouter`, and 20+ other exports. Fixes tests that depend on these being available from `@react-navigation/native`.

## 0.2.0

### Minor Changes

- Add Metro-compatible extensionless module resolution for node_modules. Add navigation preset mocks for @react-navigation/native-stack, @react-navigation/bottom-tabs, and @react-navigation/elements. Support custom presets.

## 0.1.3

### Patch Changes

- 260ae84: Fix package metadata: correct GitHub URLs and Node >= 20 engine requirement.
