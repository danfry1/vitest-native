---
"vitest-native": minor
---

**Under the native engine, a React Native library's own Jest setup and mocks get a `jest` with Jest's semantics.** No action needed; a suite that imports `react-native-gesture-handler/jestSetup` or `react-native-safe-area-context/jest/mock` gets what Jest gave it.

- Their `jest.mock` reaches every `require` of the module, and `jest.requireActual` and `@jest/globals` work.
- Implementations a library installs while building its mocks survive `vi.resetAllMocks()` and `mockReset: true`.
- `jest.requireActual` of a package a preset shadows returns the package, as under Jest.
