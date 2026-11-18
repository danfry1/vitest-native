---
"vitest-native": minor
---

**A native-engine run on a cold cache no longer fails tests on Vitest's 5000 ms timeout: `registryBuild` now defaults to `'wait'`.** No action needed; `reactNative({ registryBuild: 'background' })` keeps the previous behaviour.

- React Native's precompiled modules are built before the first test file starts, so every file uses them.
- Under `'background'`, files that started before the build finished compiled React Native inside their tests, every worker the same modules at once. A test rendering a few components could take over 5 s.
- Warm runs, CI runs and the hot runtime are unchanged.

Thanks @YevheniiKotyrlo for the report and the side-by-side reproduction (#873).
