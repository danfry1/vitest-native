---
"vitest-native": minor
---

Under the native engine, React Native libraries' own Jest support runs with Jest's module semantics. A library's setup file or mock (`react-native-gesture-handler/jestSetup`, `react-native-safe-area-context/jest/mock`, `react-native-reanimated/mock`) gets a `jest` of its own: `jest.mock` reaches every `require` of the module, `jest.requireActual` and `@jest/globals` work, and an implementation the library installs while building its mocks survives `vi.resetAllMocks()` and `mockReset: true` (where Jest's `resetMocks` would drop it). What a library's setup registers lasts as long as its module: each test file loads it afresh by default and under the hot runtime, and under `isolate: false` a setup file's library mocks reach every file, as the module itself does. A setup file is served whether it is required, imported or listed in `setupFiles`, and so is one of a workspace library linked from outside node_modules; the project's own files named `mock` or under a `jest/` directory are not given a library's `jest`. Before, a suite migrated from Jest that imported such a setup file ran it with Vitest's `vi`, whose `mock` never reaches Node's `require`, so it changed nothing. Nothing is put on the global `jest`.

`jest.requireActual` of a package a preset shadows is the package, as under Jest; it was the preset.

A package naming different files in its `react-native` field and its `main` is one module whether imported or required: a bare `require` now resolves the `react-native` field, as Metro and an `import` do, where it read `main` and loaded a second copy (`react-native-worklets` was loaded twice). With Reanimated 4.7 or later, its test helpers `withReanimatedTimer` and `advanceAnimationByTime` work without the jest-compat layer.
