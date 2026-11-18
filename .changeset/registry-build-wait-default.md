---
"vitest-native": minor
---

**On a cold cache, the native engine no longer compiles React Native inside your tests: `registryBuild` now defaults to `'wait'`.** No action needed; `reactNative({ registryBuild: 'background' })` keeps the previous behaviour.

- React Native's precompiled modules are built before the first test file starts, so every file uses them.
- Under `'background'`, files that started before the build finished compiled React Native inside their tests, every worker the same modules at once, so a test rendering a few components could take seconds and reach `testTimeout`.
- Warm runs, CI runs and the hot runtime are unchanged.

Thanks @YevheniiKotyrlo for the report and the side-by-side reproduction (#873).
