---
"vitest-native": patch
---

**A cache miss after a lazy global is installed no longer fails with `Cannot read properties of undefined (reading 'environmentVisitor')` under the native engine.** This hit Expo SDK 57 projects on a warm transform cache, and the error named whichever file missed the cache. SDK 57's runtime, which the engine installs at setup, replaces `TextDecoder` with a lazy getter. Babel read that getter while it was still loading, and the getter's file was then compiled by the half-loaded Babel. No action needed: Babel now runs apart from the tests, as it does under Jest. A project Babel config or plugin sees these differences:

- `process.argv` is the Babel worker's.
- `require("node:worker_threads").isMainThread` is `false`.
- The tests' `require.cache` and globals are not visible.

`process.env` is shared. If Babel stops answering, for example because it ran out of heap or a config called `process.exit()`, the file now fails with `TRANSFORM_FAILED` instead of hanging. That takes at most a minute.
