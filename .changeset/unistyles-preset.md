---
"vitest-native": minor
---

A `unistyles` preset for `react-native-unistyles` 3, which resolves styles in native code and could not load in tests. It is auto-detected when the package is installed. It covers everything Unistyles' own Jest mock does (themes from `StyleSheet.configure`, `StyleSheet.create`, `useUnistyles`, `withUnistyles`, `UnistylesRuntime`), and it follows the library's source where that mock does less:

- variants and compound variants apply, selected with `useVariants`;
- `initialTheme` and `adaptiveThemes` pick the theme, and `setTheme` switches it;
- `Display` and `Hide` follow `mq` against the screen size;
- `ScopedTheme` renders its children.

Configuration mistakes throw the device runtime's messages.
