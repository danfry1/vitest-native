---
"vitest-native": patch
---

Cross-check the Animated API surface, not just its behaviour

Every existing probe pins a behaviour, which cannot catch a member the mock invents:
code written against one passes under the mock engine and throws under the native
engine, because real React Native has no such method. Comparing the two surfaces
directly found five such members, and nine real React Native members the mock does not
implement — the same trap in reverse, where valid React Native code throws under the
mock.

The corpus now compares the member lists of `Animated`, `Animated.Value`,
`Animated.ValueXY` and interpolations under both engines. Today's divergences are
enumerated in an allowlist so they are reviewed rather than invisible, and anything new
on either side fails. They are also recorded in the published known-differences table:

- Extra on the mock: `getValue()` on values and interpolations (real React Native
  exposes only the internal `__getValue()`), plus `resetAnimation()`/`stopAnimation()`
  on interpolations.
- Missing from the mock: `Animated.Node`, `Animated.Event`, `Animated.Interpolation`,
  `attachNativeEvent`, `Value.track`, `Value.stopTracking`, `Value.animate`,
  `hasListeners`, `ValueXY.toJSON`.
