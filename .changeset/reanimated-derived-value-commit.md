---
"vitest-native": patch
---

**A Reanimated derived value from a render React discards no longer keeps running.** `useDerivedValue` started following the shared values it read during render. When React discarded that render (a Suspense throw, an error boundary, an abandoned concurrent render), no cleanup stopped it, so its updater ran on every later write. It now starts following only when the component commits, as Reanimated starts its mapper in an effect. No action needed.
