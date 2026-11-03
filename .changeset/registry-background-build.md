---
"vitest-native": minor
---

**A cold native-engine run no longer waits for the precompiled React Native registry.** When the registry is not in the cache (first install, a React Native or vitest-native upgrade, a toolchain change), the run starts at once and the registry compiles in a low-priority background process. Test files that start before it is ready load React Native file by file, which is slower per file; files that start after it lands use it. The column numbers in React Native's own stack frames can differ between those first files and later ones. No action needed; set `reactNative({ registryBuild: 'wait' })` to compile the registry before the run, as in earlier versions.

When Vitest closes, a build still running gets up to half of `teardownTimeout` to finish, so the next run starts warm. It is stopped at once after a cancelled run (`--bail`, Ctrl-C), and on a stop signal or any other exit. The hot runtime (`hotRuntime`) and CI runs still wait for the registry. On Windows, a Vitest process killed outright (`taskkill /F`, a cancelled CI job) can leave the compiler running for up to about 130 s, until its own deadline.
