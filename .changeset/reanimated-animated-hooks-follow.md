---
"vitest-native": patch
---

**Reanimated's `useAnimatedStyle`, `useAnimatedProps` and `useAnimatedReaction` now follow the shared values they read, without a render.** Previously the style and props updaters ran only at render, so `progress.set(0.5)` followed by `toHaveAnimatedStyle` saw the old style, and a child React skipped (such as one React Compiler memoized) kept its first one. The reaction never ran. Now the updaters rerun when a shared value they read changes, and the reaction runs on mount and on each change, as Reanimated's mappers do. This covers Reanimated 4.7's own mock and the built-in preset for older versions. No action needed.
