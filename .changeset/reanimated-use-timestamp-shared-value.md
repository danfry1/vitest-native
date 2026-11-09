---
"vitest-native": patch
---

**`useTimestamp` from `react-native-reanimated` now returns a shared value with `get()`.** Reanimated's test mock returns `{ value: 0 }`, so an app reading it with `.get()` failed with `… .get is not a function`. The engine corrects it as it already corrects `useScrollOffset` and `useScrollViewOffset`. No action needed.
