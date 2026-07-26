---
"vitest-native": minor
---

The mock engine's Animated surface now matches React Native's

Nine members React Native has were missing from the mock, so valid React Native code
calling any of them threw under `engine: 'mock'` while working under `engine: 'native'`:
`Animated.Node`, `Animated.Event`, `Animated.Interpolation`, `attachNativeEvent`,
`Value.track`, `Value.stopTracking`, `Value.animate`, `hasListeners` and `toJSON`. All
are implemented, following React Native's own semantics — `track()` kicks the tracking
node immediately and replaces any previous one, `animate()` stops a running animation
before starting the next and reports completion, `toJSON()` returns the current value.

`stopAnimation` and `resetAnimation` moved off the shared base class onto `Value` and
`Color`, which is where React Native puts them. They were reaching interpolations,
which are derived and cannot be animated.

`getValue()` remains — it is not a React Native API, and real React Native exposes only
`__getValue()` — but now warns once per process, because the same call throws under the
native engine. Use `__getValue()` for code that must run on both. It is the only
remaining difference in this surface, and is recorded on the published fidelity page.
