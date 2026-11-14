---
"vitest-native": patch
---

**Reanimated's `useAnimatedStyle`, `useAnimatedProps` and `useAnimatedReaction` now follow the shared values they read, without a render.** Previously the style and props updaters ran only when the component rendered, so a test that called `progress.set(0.5)` and then asserted with `toHaveAnimatedStyle` saw the old style. A child that React skipped, such as one React Compiler memoized, kept its first style. The reaction never ran. Now each style or props updater reruns when a shared value it read changes, and the new result reaches the rendered element's props. The reaction runs on mount and whenever a shared value its `prepare` function read changes, as Reanimated's mapper does. This works with or without the worklets Babel plugin, for Reanimated 4.7's own mock and for the built-in preset that serves older versions. No action needed.
