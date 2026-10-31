---
"vitest-native": patch
---

**A cold native-engine run no longer waits for the precompiled React Native registry.** On a cache miss (first install, a React Native or vitest-native upgrade, a toolchain change, CI without a cache), the run starts at once while the registry compiles in a low-priority background process. Test files that start before it is ready load React Native file by file, which is slower per file but gives the same results; files that start after it lands use it. No action needed.

Before vitest-native closes, a build still running gets what is left of Vitest's `teardownTimeout` to finish, so the next run starts warm. Under CI (`CI` set) it is stopped at once instead, and any exit, including Ctrl-C, stops it. The hot runtime (`hotRuntime`) still waits for the registry before starting. Set `VITEST_NATIVE_REGISTRY_WAIT=1` to wait on every run, as before.
