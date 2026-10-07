---
"vitest-native": minor
---

jest-compat: one module registry per test file, as in Jest. A `jest.mock(spec, factory)` (and `jest.doMock`, `jest.setMock`) now applies to `require()` from a test, to the modules `jest.requireActual` loads, and to React Native's own requires of a mocked internal such as `react-native/Libraries/AppState/AppState`, with the same mock instance the file's imports see. `jest.requireActual` unmocks only the module requested, `jest.requireMock` returns the registered mock instead of the real module, and `jest.resetModules()` gives `require()` fresh project modules and re-runs mock factories while React Native stays loaded. `jest.isolateModules` and `jest.isolateModulesAsync`, which previously threw, are implemented. A project module the test has imported is the instance `require()` returns. Under the hot runtime the registry is cleared between files and verified empty. Factory-less mocks (automock and `__mocks__`) still apply to imports only.
