---
"vitest-native": patch
---

Under the hot runtime, externalized imports are no longer re-resolved from scratch for every test file. The per-file generation stamp on parent URLs defeated Node's resolve cache; the loader now keeps successful resolutions per unstamped parent, so Node stops re-reading package.json scopes to decide module formats on every file.
