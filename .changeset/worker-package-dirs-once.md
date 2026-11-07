---
"vitest-native": patch
---

**Under the native engine, each test worker works out which packages Node compiles once, from directories the plugin already resolved.** A worker used to resolve the directory of every package Node compiles twice per test file, once for its ES module loader and once for its `require` hooks. With per-file isolation every test file has a new worker, so the cost grew with the number of test files. The plugin now records those directories for its workers, and the two hooks share one answer per worker. No action needed.
