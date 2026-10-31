---
"vitest-native": patch
---

**Under an isolated install (pnpm, or bun's isolated linker), the native engine compiles the transitive dependencies of React Native packages.** No action needed. Hoisted layouts are unaffected.

Before, each dependency was looked up from the project root, where an isolated install links only the project's direct dependencies, so none was found. With `presets: { navigation: false }`, the uncompiled `@react-navigation/elements` then failed at import with "The requested module '@react-navigation/native' does not provide an export named 'useTheme'". Each dependency is now resolved from the package that declares it, as Node resolves it. The build toolchain (Metro, `@babel/runtime`, `babel-preset-expo`, `@expo/metro`) is found where React Native and Expo install it, so its dependencies stay out of the transform.
