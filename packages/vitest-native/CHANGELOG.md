# vitest-native

## 0.2.1

### Patch Changes

- Add missing `@react-navigation/core` re-exports to navigation preset, including `useNavigationContainerRef`, `useTheme`, `ThemeProvider`, `NavigationIndependentTree`, `useNavigationBuilder`, `BaseRouter`, and 20+ other exports. Fixes tests that depend on these being available from `@react-navigation/native`.

## 0.2.0

### Minor Changes

- Add Metro-compatible extensionless module resolution for node_modules. Add navigation preset mocks for @react-navigation/native-stack, @react-navigation/bottom-tabs, and @react-navigation/elements. Support custom presets.

## 0.1.3

### Patch Changes

- 260ae84: Fix package metadata: correct GitHub URLs and Node >= 20 engine requirement.
