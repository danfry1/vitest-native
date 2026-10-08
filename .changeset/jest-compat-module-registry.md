---
"vitest-native": minor
---

jest-compat: one module registry per test file, as in Jest. A `jest.mock(spec, factory)` (and `jest.doMock`, `jest.setMock`) now applies to `require()` from a test, to the modules `jest.requireActual` loads, and to React Native's own requires of a mocked internal such as `react-native/Libraries/AppState/AppState`, with the same mock instance the file's imports see. `jest.requireActual` unmocks only the module requested, `jest.requireMock` returns the registered mock instead of the real module, and `jest.resetModules()` gives `require()` fresh project modules and re-runs mock factories while React Native stays loaded. `jest.isolateModules` and `jest.isolateModulesAsync`, which previously threw, are implemented with Jest's semantics. A project module the test has imported is the instance `require()` returns. Registrations last for one test file, including in a reused worker. Factory-less mocks (automock and `__mocks__`) still apply to imports only.

TypeScript project files that Node loads are now compiled with the project's Babel config when it has one, as babel-jest compiles them, and relative imports from any file Node loads resolve in Metro's platform-extension order.
