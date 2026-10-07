---
"vitest-native": patch
---

jest-compat: four Jest behaviours that migrated suites depend on now match Jest.

- **Getters in a `jest.mock` factory are read lazily.** The CommonJS interop copied the factory's return with an object spread, which ran every getter while the factory was evaluated. A factory such as `() => ({ get IS_WEB() { return mockIsWeb } })` runs during the hoisted imports, before the test file's `let mockIsWeb` is initialised, so it threw `Cannot access 'mockIsWeb' before initialization`, and later changes to the variable were never seen. Accessors are now read from the module on each access, as an importer reads them in Jest.
- **An export a `jest.mock` factory leaves out is `undefined`.** Jest reads named imports as properties of `module.exports`; Vitest throws `No "x" export is defined on the "m" mock`. Factories passed through `jestMockTransform` now follow Jest. A plain `vi.mock` factory keeps Vitest's strict check.
- **`new` on a `jest.fn` with an arrow implementation returns the implementation's result.** Jest applies a mock's implementation whether or not it is called with `new`, so `jest.fn().mockImplementation(() => ({ fetch }))` works as a class mock; Vitest constructs the implementation and throws `… is not a constructor`. Mocks created by `jest.fn` and `jest.spyOn` now follow Jest, including `mockReturnValue` and `mockResolvedValue` under `new`, and a `jest.spyOn` spy with no implementation set calls an arrow-function original under `new` (also after `mockReset()`). A mock that already existed, which `jest.spyOn` returns as it is, is left unchanged, and `vi.fn` is unchanged.
- **`process.env.JEST_WORKER_ID` is set.** The compat setup sets it from Vitest's 1-based `VITEST_POOL_ID` when it is not already set, so code that detects a Jest run (for example `__DEV__ && !process.env.JEST_WORKER_ID`) takes its test branch.
