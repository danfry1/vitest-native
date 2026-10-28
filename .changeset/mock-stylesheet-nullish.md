---
"vitest-native": patch
---

The mock engine's `StyleSheet.compose` and `StyleSheet.flatten` now match React Native for missing and empty styles. `compose(null, b)` returns `b` and `compose(a, undefined)` returns `a`, where the mock returned a two-element array. `flatten([])` and `flatten([null, false])` return `{}`, and `flatten` of a number or string returns `undefined`.
