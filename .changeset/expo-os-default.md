---
"vitest-native": patch
---

The native engine sets `process.env.EXPO_OS` to the test platform in a project that resolves `expo`, unless the project already set it. babel-preset-expo inlines the variable when it compiles a file, but the engine compiles packages in `node_modules` with React Native's Babel preset, so Expo's packages read it at runtime and found it unset: expo-modules-core warned that it should have been inlined, its `Platform.select` returned `undefined`, and expo-router took its non-iOS branches on iOS. The hot runtime keeps the value between test files.
