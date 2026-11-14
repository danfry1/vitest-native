---
"vitest-native": minor
---

**Reanimated's `useAnimatedStyle`, `useAnimatedProps` and `useAnimatedReaction` now run as Reanimated's mappers do, without a render.** A style read after `progress.set()` is current, also in a memoized child, and reactions run. Tests that relied on the old render-only behaviour can change:

- Reactions run on mount and on each change, so their spies and `runOnJS` side effects fire.
- Updaters rerun on each write, so call counts change, and an updater that throws now throws at the write.
- A key an updater stops returning keeps its last value, as in Reanimated.

Update tests that counted on the old behaviour; see [Reanimated's animated hooks](https://vitest-native.danfry.dev/guide/presets#reanimated-s-animated-hooks).
