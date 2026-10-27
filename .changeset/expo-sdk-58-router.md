---
"vitest-native": patch
---

Under the native engine, a test that imports `expo` or `expo-router` from Expo SDK 58 (React Native 0.88) no longer hangs. Expo's runtime requires `react-native/setup-env`, which replaced Node's timers with React Native's native-driven ones, so the first awaited timer never fired. That entry is now skipped, as `InitializeCore` already was. The `expo-linking` preset also adds `getLinkingURL`, `openURL` and `unwrapDevLaunchURL`, which expo-router 58 calls while rendering a route tree.
