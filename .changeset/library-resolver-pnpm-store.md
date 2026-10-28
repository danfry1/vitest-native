---
"vitest-native": patch
---

Under the native engine, the Jest resolvers that react-native-reanimated and react-native-worklets ship are now consulted only for those packages' own files, and are shown each file's package-relative path. They tell their files apart by substring, which also matched packages beside them in a pnpm store (pnpm names a package's store directory after its peers) and `react-native-worklets-core`. So in pnpm installs, expo-modules-core and reanimated itself loaded their web files instead of `.native` ones, and expo-router's native-stack failed with "requireNativeViewManager is not available on ios".
