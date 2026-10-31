---
"vitest-native": patch
---

**React Native Testing Library's automatic cleanup runs without `test.globals: true`** (RNTL 12–14, both engines, the hot runtime and `isolate: false`). No action needed. If a suite relied on trees staying mounted between tests, import `@testing-library/react-native/pure` or set `RNTL_SKIP_AUTO_CLEANUP`.

RNTL registers its cleanup `afterEach` only when `afterEach` is a global, so with Vitest's default every rendered tree stayed mounted for the rest of the file and later tests saw earlier screens. The setup file now registers the same cleanup through Vitest's `afterEach`, for files that load RNTL's main entry directly or through a package that re-exports it, such as a shared test-utils. It calls RNTL 13's `cleanupAsync`, and 12's and 14's `cleanup`, as each version's own hook does. `/pure` and `RNTL_SKIP_AUTO_CLEANUP` still opt out, also in a worker where an earlier file loaded RNTL.

With `isolate: false`, Vitest keeps fake timers from one file to the next, so a setup file that calls `vi.useFakeTimers()`, or a file that ends with fake timers on, no longer makes every later file's cleanup time out: the cleanup waits on `node:timers`' `setImmediate`, which fake timers do not replace.

Under the mock engine with `test.globals: true`, a file that imports `@testing-library/react-native/pure` is no longer cleaned up automatically, as RNTL documents: the mock engine's setup used to load RNTL's main entry itself, which registered RNTL's cleanup for every file.

The cleanup runs after the file's own `afterEach` hooks, as RNTL's does under Vitest with globals on; Jest runs it first.
