---
"vitest-native": patch
---

**A Reanimated derived value now follows the shared values it reads, without a render.** `useDerivedValue` ran its updater only when the component rendered, so `progress.set(0.5)` followed by a read of the derived value gave the old result. A child React skipped (memoized, as React Compiler does) kept its first result, so Skia props and assertions saw stale values. It now reruns when a shared value it read changes, as Reanimated's mapper does, with or without the worklets Babel plugin. This covers Reanimated 4.7's own mock and the built-in preset for older versions. No action needed.
