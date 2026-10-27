---
"vitest-native": patch
---

The native engine runs in an Expo project without `@react-native/babel-preset`. From SDK 56, `babel-preset-expo` carries React Native's Babel plugins itself and no longer depends on that preset, so a project created from the SDK 56, 57 or 58 template has none installed, and `reactNative()` fell back to the mock engine, where Expo modules failed to load. When `@react-native/babel-preset` does not resolve, the engine now compiles with Expo's preset (`expo/internal/babel-preset`), which Expo's Metro and jest-expo use in a project without a Babel config. A project that has `@react-native/babel-preset` keeps using it.
