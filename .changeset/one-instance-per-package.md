---
"vitest-native": patch
---

**Under the native engine, a package whose `react-native` field and `main` name different files is one module, imported or required.** No action needed.

- A bare `require` resolves the `react-native` field, as Metro and an `import` do, for a package that depends on React Native or has a TypeScript entry. Before, a library's require and a test's import held separate copies.
- `jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))` works, as under Jest.
- Other packages keep `main`, and `require.resolve` with `paths` is unchanged.
