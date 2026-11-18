---
"vitest-native": patch
---

**`jest.mock` under `jestMockTransform()` now works with Vitest's default `globals: false`.** A test file that imported `test` or `expect` from `vitest` but not `vi` failed before any test ran, with `ReferenceError: vi is not defined`. The transform now imports `vi` itself in each file it rewrites, unless the file already imports it. Stack traces keep the file's own line numbers. No action needed.

- A file that declares its own `vi` keeps it, and the rewritten calls reach Vitest as `vitest`.
- A file that binds both `vi` and `vitest` to something other than an import from `vitest`, where the rewritten calls run, fails with `JEST_MOCK_VI_UNAVAILABLE`, which names the file.
