---
"vitest-native": patch
---

**Reanimated's `interpolateColor` works under the mock engine.** It threw `PRESET_UNAVAILABLE` there with reanimated 4.x, because its file imports React Native, which the mock engine does not transform. The preset now loads reanimated's own `interpolateColor` against the mock engine's React Native, so it returns what reanimated returns: RGB, HSV and LAB, with colour strings or numbers. A component that animates a colour no longer fails under the mock engine. No action needed.
