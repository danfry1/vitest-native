---
"vitest-native": minor
---

A `unistyles` preset for `react-native-unistyles` 3, which resolves styles in native code and could not load in tests. It is auto-detected when the package is installed. It covers everything Unistyles' own Jest mock does (themes from `StyleSheet.configure`, `StyleSheet.create`, `useUnistyles`, `withUnistyles`, `UnistylesRuntime`), and it follows the library's source where that mock does less:

- styles resolve as the device parses them: breakpoint values and `mq` keys against the screen, `_web` styles dropped;
- variants and compound variants apply by the device's rules, selected with `useVariants`;
- `StyleSheet.configure()` validates its input and picks the theme with the device runtime's messages; adaptive themes follow the colour scheme, and `setTheme`, `updateTheme` and `setAdaptiveThemes` take effect;
- `useUnistyles()`, `withUnistyles`, `Display`, `Hide` and `ScopedTheme` re-render on a theme or screen change;
- `ScopedTheme` scopes a theme to its children, and `withUnistyles` applies `uniProps`;
- `Display` and `Hide` follow `mq` against the screen size;
- `resetAllMocks()` returns the theme to what `StyleSheet.configure()` set.

`vitest-native migrate` now deletes a library's own test setup file (such as `react-native-unistyles/mocks`) when a detected preset shadows that library, since its `jest.mock()` calls would replace the preset.
