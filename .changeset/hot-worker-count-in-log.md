---
"vitest-native": patch
---

**Under the hot runtime, the startup log now names the worker count on every run.** It reads `[vitest-native] workers: 4 (automatic cap of 4; 9 available, set maxWorkers to run more; 24576 MiB host memory)`, so tuning `maxWorkers` or reporting a run no longer needs diagnostics on. Diagnostics is a plugin option, `reactNative({ diagnostics: true })`; the docs now say so, and that `VITEST_NATIVE_DIAGNOSTICS` is not read. No action needed.
