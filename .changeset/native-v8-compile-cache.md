---
"vitest-native": patch
---

Cache the React Native graph's compiled bytecode under the native engine.

With per-file isolation (`engine: 'native'`, the default), React Native's module graph is re-instantiated for every test file, recompiling its source to V8 bytecode each time. The native engine now enables Node's on-disk compile cache (Node 22.8+) before React Native is loaded, so subsequent compilations across files, workers, and runs reuse cached bytecode. Measured on a 100-file suite (single worker), this reduced cold time by ~7% and warm time by ~7-18% with tighter run-to-run variance and no change in memory use. It is a no-op on Node versions without the compile-cache API.
