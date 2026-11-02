---
"vitest-native": patch
---

**A cache miss after a lazy global is installed no longer fails with `Cannot read properties of undefined (reading 'environmentVisitor')` under the native engine.** This hit Expo SDK 57 projects on a warm transform cache, and the error named whichever file missed the cache. SDK 57's runtime, which the engine installs at setup, replaces `TextDecoder` with a lazy getter, and Babel read it while still loading. No action needed: Babel now runs apart from the tests, as it does under Jest. A project Babel config or plugin sees these differences:

- `process.argv` is the Babel worker's.
- `require("node:worker_threads").isMainThread` is `false`.
- The tests' `require.cache` and globals are not visible.

`process.env` is shared. If Babel's thread is lost, the file fails with `TRANSFORM_FAILED`. That happens at once when something exits the thread, such as a `process.exit()` in a config. When the thread runs out of heap, it happens after a deadline: 60 s plus 15 s per MB of the file's source. A transform slower than that deadline now fails the same way.
