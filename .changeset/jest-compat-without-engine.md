---
"vitest-native": patch
---

**A project that uses `vitest-native/jest-compat` without `reactNative()` runs its tests again.** Since 0.15.0 the jest-compat setup loaded React Native's Flow source through Node, and every test file failed at startup with `SyntaxError: Unexpected token 'typeof'`. No action needed.

- The setup fills `View.prototype` only when the mock or the native engine is configured, where it behaves as before. With no engine, it no longer loads `react-native`.
