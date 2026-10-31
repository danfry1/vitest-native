---
"vitest-native": patch
---

**A copied checkout no longer fails with "more than one copy of React" under the native engine.** A project copied together with `node_modules/.cache/vitest-native` reused the original's precompiled React Native registry, which loads React Native from the original checkout. Every test failed until the cache was deleted. No action needed: the copy now builds its own registry on its first run.

The same fix covers a project whose `react-native` starts resolving to a different installed copy, for example a workspace package that gains its own. A symlinked path to the same project keeps its cache.
