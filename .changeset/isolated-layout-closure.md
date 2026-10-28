---
"vitest-native": patch
---

Under an isolated install layout (pnpm, bun's isolated linker), the native engine now compiles the transitive dependencies of detected React Native packages. Each dependency is resolved from the package that declares it, as Node resolves it, rather than from the project root, where only the project's direct dependencies are linked. Before, none was found there, so with `presets: { navigation: false }` the uncompiled `@react-navigation/elements` failed at import with "The requested module '@react-navigation/native' does not provide an export named 'useTheme'". Hoisted layouts were unaffected. The build toolchain stays out of that walk under an isolated layout too: Metro, `@babel/runtime` and Expo's Babel preset are now found where React Native and Expo install them, so their dependencies are not handed to the transform.
