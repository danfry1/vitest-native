---
"vitest-native": patch
---

The native engine's ESM loader hooks now run in-thread through `module.registerHooks()` where Node provides it (22.15+, 23.5+), instead of on a separate loader thread through `module.register()`. Every resolve and load of an externalized module previously waited on a synchronous cross-thread request; profiled on a 104-file production Expo suite, that wait was 18% of worker CPU time. Older Node versions keep the threaded hooks, and `VITEST_NATIVE_LOADER_THREAD=1` forces them.
