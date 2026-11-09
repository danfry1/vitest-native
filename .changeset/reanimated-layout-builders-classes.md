---
"vitest-native": patch
---

**Reanimated's layout animations, `Keyframe`, `useAnimatedRef` and worklet runtimes behave as Reanimated's own under the native engine.** Its test mock gave one shared object per builder, so `new FadeIn()`, `instanceof FadeIn` and a class that extends a builder failed; `useAnimatedRef()` was not a function ref; and `createWorkletRuntime` / `runOnRuntime` did nothing. No action needed.

- Builders are Reanimated's own classes; the static chains (`FadeIn.duration(300)`) work as before.
- `runOnRuntime(runtime, worklet)` returns a function that runs the worklet.
