---
"vitest-native": patch
---

**Under the hot runtime, the startup log now names the worker count on every run, and what chose it.** It reads `[vitest-native] workers: 4 (automatic cap of 4; 9 available, set maxWorkers to run more; 24576 MiB host memory)`, so tuning `maxWorkers` or reporting a run no longer needs diagnostics on. No action needed.
