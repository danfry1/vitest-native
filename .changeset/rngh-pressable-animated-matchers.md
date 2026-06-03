---
"vitest-native": minor
---

Add `Pressable` to the gesture-handler preset and register reanimated-compatible `toHaveAnimatedStyle` / `toHaveAnimatedProps` matchers

- The `react-native-gesture-handler` preset now exports `Pressable`, mirroring React Native's `Pressable` (including suppressing press handlers when `disabled`).
- `toHaveAnimatedStyle` and `toHaveAnimatedProps` are auto-registered on `expect()`, replacing reanimated's Jest-only `setUpTests()` matchers. Opt into types with `"types": ["vitest-native/matchers"]`.
