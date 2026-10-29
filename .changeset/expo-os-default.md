---
"vitest-native": patch
---

**Under the native engine, `process.env.EXPO_OS` is the test platform (`ios` or `android`) in a project that resolves `expo`.** No action needed. A value already set in the environment or `test.env` is kept, and `vi.stubEnv("EXPO_OS", …)` overrides it per test.

babel-preset-expo inlines `EXPO_OS` as it compiles, but the engine compiles `node_modules` with React Native's Babel preset, so Expo's packages read the variable at runtime and found it unset: expo-modules-core warned that it "should be inlined by babel-preset-expo", its `Platform.select` returned `undefined`, and expo-router took its non-iOS branches on iOS. The hot runtime keeps the value between test files. The mock engine does not set it.
