---
"vitest-native": patch
---

**React Native Testing Library's automatic cleanup runs without `test.globals: true`**, under both engines, the hot runtime and `isolate: false`. No action needed. If a suite relied on trees staying mounted between tests, import `@testing-library/react-native/pure` or set `RNTL_SKIP_AUTO_CLEANUP`.

RNTL registers its cleanup `afterEach` only when `afterEach` is a global, so with Vitest's default every rendered tree stayed mounted for the rest of the file and later tests saw earlier screens. The setup file now registers the same cleanup through Vitest's `afterEach`, for files that load RNTL's main entry directly or through a package that re-exports it, such as a shared test-utils. `/pure` and `RNTL_SKIP_AUTO_CLEANUP` still opt out, also in a worker where an earlier file loaded RNTL. The mock engine's setup no longer loads RNTL's main entry itself, which had turned cleanup on for `/pure` files.

The cleanup runs after the file's own `afterEach` hooks, as RNTL's does under Vitest with globals on; Jest runs it first. Not covered: without `vitest-native/jest-compat`, RNTL cannot see `vi.useFakeTimers()`, so `waitFor` and `findBy*` do not advance the fake clock. Use jest-compat or advance timers by hand.
