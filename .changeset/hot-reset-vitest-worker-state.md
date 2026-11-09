---
"vitest-native": patch
---

**Under the hot runtime, RNTL's auto-cleanup works in every file again.** The hot reset put back Vitest's own worker state from the first file on a worker, so later files read that file's module graph. When the first file opted out with `dont-cleanup-after-each`, every later file on the worker lost auto-cleanup, and a test's components stayed mounted into the next. The reset now leaves Vitest's globals alone, and fails a file by name if Vitest's worker state names another file. No action needed.
