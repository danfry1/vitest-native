---
"vitest-native": minor
---

**The navigation preset's link props, prevent-remove context, navigator helpers and native-stack header height match React Navigation 7.** `useLinkProps()` returns `role: "link"` where it returned `accessibilityRole: "link"`, so a snapshot of a link built from it changes. `usePreventRemoveContext()` returns the provided context, or an empty one (`preventedRoutes: {}`) where it returned `null`. `useNavigationBuilder().navigation` is a navigator's helpers: `useNavigation()`'s functions plus `emit`, which returns React Navigation's event object; it is a separate object from `useNavigation()`'s and stays the same on every render. `@react-navigation/native-stack` exports `useAnimatedHeaderHeight()`, an `Animated.Value` of 64 from the engine's React Native. Update snapshots that print `accessibilityRole="link"` from `useLinkProps`, and tests that expected `usePreventRemoveContext()` to be `null`.
