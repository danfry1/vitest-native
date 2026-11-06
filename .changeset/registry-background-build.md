---
"vitest-native": minor
---

**Native engine: a cold run now starts at once instead of waiting for React Native's precompiled modules to build.** They compile in a low-priority background process.

To opt out, set `reactNative({ registryBuild: 'wait' })` to build them before the run, as before.

- Test files that start before the build lands load React Native file by file, which is slower; column numbers in React Native's stack frames can differ.
- CI runs and `hotRuntime` still wait. On close, a running build gets half of `teardownTimeout` to finish.
- Not covered: on Windows, a Vitest process killed outright can leave the compiler running for about 130 s.
