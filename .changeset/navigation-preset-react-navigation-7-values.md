---
"vitest-native": minor
---

**The navigation preset's link props, prevent-remove context, navigator helpers and header heights match React Navigation 7.**

- `useLinkProps()` returns `role: "link"`, not `accessibilityRole`, so a link's snapshot changes. `usePreventRemoveContext()` returns an empty context, not `null`.
- `useNavigationBuilder().navigation` has `emit` and is its own object, the same on every render.
- native-stack's new `useAnimatedHeaderHeight()` is an `Animated.Value` at the library's default (44 on an iOS phone, 56 on Android). `getDefaultHeaderHeight()` computes the library's height instead of 64.

Update snapshots with `accessibilityRole="link"` from `useLinkProps`, and tests that expected `null` or 64 from these.
