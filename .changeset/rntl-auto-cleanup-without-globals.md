---
"vitest-native": patch
---

React Native Testing Library's automatic cleanup now runs without `test.globals: true`, under both engines, the hot runtime and `isolate: false`. RNTL registers its `afterEach` cleanup only when `afterEach` is a global, so with Vitest's default every rendered tree stayed mounted for the rest of the file and later tests saw earlier screens. The setup file now registers the same cleanup through Vitest's `afterEach` when RNTL cannot, for files that load RNTL's main entry, directly or through another package such as a shared test-utils that re-exports it. Importing `@testing-library/react-native/pure` and setting `RNTL_SKIP_AUTO_CLEANUP` still opt out, also in a worker an earlier file loaded RNTL into, and the mock engine's setup file no longer loads RNTL's main entry itself, which had turned the cleanup on for `/pure` files too. The cleanup runs after the file's own `afterEach` hooks, as RNTL's does under Vitest with globals on.
