---
"vitest-native": patch
---

React Native Testing Library's automatic cleanup now runs without `test.globals: true`, under both engines and the hot runtime. RNTL registers its `afterEach` cleanup only when `afterEach` is a global, so with Vitest's default every rendered tree stayed mounted for the rest of the file and later tests saw earlier screens. The setup file now registers the same cleanup through Vitest's `afterEach` when RNTL cannot, for files that import RNTL's main entry. Importing `@testing-library/react-native/pure` and setting `RNTL_SKIP_AUTO_CLEANUP` still opt out, and the mock engine's setup file no longer loads RNTL's main entry itself, which had turned the cleanup on for `/pure` files too.
