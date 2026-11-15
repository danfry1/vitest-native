---
"vitest-native": minor
---

**The screens preset's `useTransitionProgress()` returns Animated values, and `Tabs`, `featureFlags` and `compatibilityFlags` have the package's shape.** `progress`, `closing` and `goingForward` were numbers, so a screen that called `progress.interpolate(…)` failed. They are now `Animated.Value`s from the engine's React Native, kept across renders and starting at 0 as in react-native-screens (`progress` was `1`). `Tabs` is `{ Host, Screen }`, and the flags carry the package's defaults. Update a test that read these values as numbers or rendered `<Tabs>` directly.
