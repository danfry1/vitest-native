---
"vitest-native": patch
---

**Under the hot runtime, the require bridge's counters now last for the worker's life instead of reading empty from its second file on.** No action needed. They appear during a worker's first file, and the per-file reset deleted them with that file's globals. vitest-native's worker-lifetime globals are now declared in one list, which the reset keeps.
