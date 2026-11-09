---
"vitest-native": patch
---

**Every Reanimated hook that gives a shared value now gives one with Reanimated 4's shape under the native engine.** Reanimated's test mock gave plain values from `useTimestamp`, the scroll offsets, `useAnimatedKeyboard` and `useAnimatedSensor`, and shared values without `modify()`, listeners or the `isSharedValue()` mark, so app code calling `.get()` failed. No action needed.

- Covers `useSharedValue`, `useDerivedValue`, `useScrollOffset`, `useScrollViewOffset`, `useTimestamp`, `useAnimatedKeyboard`, `useAnimatedSensor` and `makeMutable`.
- A mock that already gives the right shape keeps its own.
