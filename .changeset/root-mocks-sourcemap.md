---
"vitest-native": patch
---

**A cold run with root `__mocks__` no longer warns that a sourcemap points to missing source files.** The module jest-compat generates for root manual mocks, `vitest-native.root-mocks.mjs`, has no file on disk, so Vite looked for its source there on the first run after a cache clear and in CI. No action needed.
