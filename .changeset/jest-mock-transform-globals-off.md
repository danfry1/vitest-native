---
"vitest-native": patch
---

**`jest.mock` under `jestMockTransform()` now works with Vitest's default `globals: false`.** A test file that imported `test` or `expect` from `vitest` but not `vi` failed before any test ran, with `ReferenceError: vi is not defined`. The transform now imports `vi` itself in each file it rewrites, unless the file already imports it. Stack traces keep the file's own line numbers. No action needed.

- A file that declares its own `vi` keeps it. The rewritten calls use Vitest's other name for it, `vitest`.
- A file that declares both `vi` and `vitest` as something else fails with `JEST_MOCK_VI_UNAVAILABLE`, which names the file.
