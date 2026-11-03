---
"vitest-native": minor
---

**Under the native engine, a React Native library's own Jest support runs with Jest's module semantics.** A library's setup file or mock (`react-native-gesture-handler/jestSetup`, `react-native-safe-area-context/jest/mock`, `react-native-reanimated/mock`) gets a `jest` of its own. No action needed; a suite migrated from Jest that imports such a file now gets what Jest gave it.

- That `jest.mock` reaches every `require` of the module, and `jest.requireActual` and `@jest/globals` work. Before, the file ran with Vitest's `vi`, whose `mock` never reaches Node's `require`, so it changed nothing.
- An implementation the library installs while building its mocks survives `vi.resetAllMocks()` and `mockReset: true`.
- What a setup file registers lasts as long as its module: each test file loads it afresh by default and under `hotRuntime`; under `isolate: false` it reaches every file.
- A setup file is served whether it is required, imported or listed in `setupFiles`, including from a workspace library linked outside `node_modules`. The project's own files named `mock` or under `jest/` are not given a library's `jest`, and nothing is put on the global `jest`.
- `jest.requireActual` of a package a preset shadows returns the package, as under Jest; it returned the preset.
