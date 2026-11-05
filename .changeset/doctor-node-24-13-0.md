---
"vitest-native": patch
---

**`vitest-native doctor` now warns on Node 24.13.0, which can crash a test run at startup with a segmentation fault.** The crash is in V8's garbage collector on a worker thread and is intermittent. Use another Node 24 release, such as 24.14 or later; the troubleshooting guide has the details.
