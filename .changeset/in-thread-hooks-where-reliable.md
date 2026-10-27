---
"vitest-native": patch
---

The native engine runs its ESM loader in-thread (`module.registerHooks`) only on Node 22.22.3 and later on Node 22, 24.12 and later on Node 24, and Node 26 on; other Node versions use the threaded loader (`module.register`), as Node 22.13 always has. On the earlier releases that have `registerHooks`, the in-thread hooks broke the engine: expo-router failed to load its navigation elements ("request for 'node:module' is from a module not been linked") through Node 22.22.2 and 24.11, and the hot runtime's module reset did not behave as on other versions. `VITEST_NATIVE_LOADER_THREAD=1` still forces the threaded loader anywhere.
