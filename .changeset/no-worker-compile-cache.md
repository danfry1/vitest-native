---
"vitest-native": patch
---

**Test runs under the native engine no longer stall at exit while workers write Node's compile cache.** Each worker wrote its V8 compile-cache entries when it exited, inside Vitest's pool close, and on a loaded Windows machine that held a finished run open for up to 14 seconds. vitest-native no longer turns the cache on: React Native loads from its precompiled modules, and a warm cache saved no measurable time. Delete `node_modules/.cache/vitest-native/v8`, which is no longer used. Setting `NODE_COMPILE_CACHE` still turns Node's cache on.
