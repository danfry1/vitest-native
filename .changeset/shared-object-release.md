---
"vitest-native": patch
---

**Under the native engine, `globalThis.expo.SharedObject` has `release()`.** expo-modules-core's `useReleasingSharedObject` hooks, which expo-video, expo-audio and expo-image build on, call it from their effect cleanup, so every unmount of such a component threw `TypeError: object?.release is not a function`. React reports an error in a cleanup through `console.error` instead of rethrowing, and Vitest 5 hides the console output of passing tests, so this showed only with `silent: false`. The stand-in now has the no-op `release()` the native class has; `SharedRef` and the fabricated native classes inherit it. No action needed.
