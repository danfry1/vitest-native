---
"vitest-native": patch
---

**`jest.mock` through a renamed `jest` from `@jest/globals` now applies.** `jestMockTransform()` recognised only calls on an identifier named `jest`, so `import { jest as mockJest } from '@jest/globals'` followed by `mockJest.mock(…)` was neither hoisted nor registered, and the module stayed real. A `jest` imported, required or reached as `<namespace>.jest` under any name is now handled like the global. A call through a further name (`const j = mockJest; j.mock(…)`) fails with `JEST_BINDING_NOT_FOLLOWED` instead of being skipped. No action needed.
