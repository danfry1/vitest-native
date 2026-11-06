---
"vitest-native": patch
---

**Under the hot runtime, `@testing-library/react-native/dont-cleanup-after-each` now keeps a file's render in every file, not just the first on a worker.** A file that shares one render across its tests found it unmounted after the first test when it was not the first file its worker ran. Delete any `vi.stubEnv('RNTL_SKIP_AUTO_CLEANUP', 'true')` added as a workaround.
