---
"vitest-native": minor
---

Correctness + fidelity fixes:

- **Native engine now defaults to `isolate: true`.** Previously it forced `isolate: false`
  to keep React Native's module graph hot across files. Adversarial testing proved that
  leaks state across test files that share a worker (both user-module singletons and RN's
  own stateful APIs such as `DeviceEventEmitter`), causing order-dependent, flaky failures
  at scale. The safe Vitest default now applies; `isolate: false` remains available as an
  informed opt-in in your own config. A future "hot runtime + surgical per-file reset" will
  reclaim the speed safely.
- **`StyleSheet.hairlineWidth` now matches real React Native.** It was hardcoded to `0.5`;
  it is now derived from the pixel ratio (`round(0.4 * scale) / scale`, i.e. `1/3` at the
  default scale of 3), as RN does.
- **`Animated.Value.interpolate()` now supports string output ranges.** Ranges like
  `["0deg", "360deg"]`, `["0%", "100%"]`, and arbitrary numeric-bearing strings now
  interpolate per numeric slot and preserve the unit/suffix (e.g. `"180deg"`), instead of
  returning a bare number.

- **Native engine boundary hardening.** The native-module stub now handles the RN calling
  conventions it previously broke, so a much wider slice of the API surface works under the
  native engine:
  - **Callback-style methods** now invoke the success callback (first arg by default, last
    arg for known error-first methods like `showShareActionSheetWithOptions`) instead of
    hanging. Fixes `AccessibilityInfo.isScreenReaderEnabled()` (and the other reduce-motion /
    bold-text / etc. queries) hanging forever, and `Share.share()` on iOS.
  - **Promise-returning methods** now return a real `Promise` with a sane default instead of
    `undefined`. Fixes `Linking.canOpenURL`/`getInitialURL`/`openURL`, `Image.prefetch`, and
    `Image.getSize` (which destructures a `[width, height]` tuple) crashing.
  Backed by two app-shaped native stress suites (`tests-native/stress*.test.tsx`, 29 probes)
  that serve as a permanent regression gate.

The two mock fixes were found automatically by a new dual-engine cross-check (run the same
behavioral probes under `mock` and `native`, diff against real RN as the oracle); the native
boundary gaps were found by a new app-shaped native stress suite.
