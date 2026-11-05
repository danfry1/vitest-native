---
"vitest-native": minor
---

**Reanimated's `interpolate`, `interpolateColor` and `clamp` return real values, and its scroll and event hooks run their handlers.** No action needed; snapshots of interpolated styles may change.

- Of Reanimated's own mock, only what still answers with a no-op is replaced, so a later Reanimated whose mock does better keeps its own.
- Shared values take listeners, so a Gesture Handler 3 gesture configured with a shared value works.
- Reanimated 3.17 to 4.6 get the same fixes in the hand-written preset.
