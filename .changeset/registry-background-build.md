---
"vitest-native": patch
---

**A cold native-engine run no longer waits for the precompiled React Native registry.** When the registry is not in the cache (first install, a React Native or vitest-native upgrade, a toolchain change), the run starts at once and the registry compiles in a low-priority background process. Test files that start before it is ready load React Native file by file, which is slower per file; files that start after it lands use it. The column numbers in React Native's own stack frames can differ between those first files and later ones. No action needed; set `reactNative({ registryBuild: 'wait' })` to compile the registry before the run, as before.

When Vitest closes, a build still running gets up to half of `teardownTimeout` to finish, so the next run starts warm, and is stopped after that. It is stopped at once when the run was cancelled (`--bail`, Ctrl-C), and a stop signal or any other exit stops it too. The hot runtime (`hotRuntime`) and CI runs (`CI` or a CI provider's variables set) still wait for the registry before starting. The first run after upgrading misses Vitest's module cache once, because its key changed.
