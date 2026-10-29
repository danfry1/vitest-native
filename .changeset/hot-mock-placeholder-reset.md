---
"vitest-native": patch
---

**On Vitest 4 with `hotRuntime` on, a test file no longer receives an earlier file's `vi.mock` factory.** No action needed.

Before, when one file mocked a module with a factory and a later file in the same worker mocked it any other way (an automock with `vi.mock(path)`), the later file got the earlier factory's result, and calls such as `mockReturnValue` failed with `is not a function`. Each file now fetches such a module again under its own mocks. The same holds inside one file: a factoryless `vi.doMock` after `jest.resetModules()`, or inside `jest.isolateModules`, now gets an automock. Vitest 5 and the default per-file isolation were not affected.
