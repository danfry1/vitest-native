---
"vitest-native": patch
---

**A package that fails to load because a partial `jest.mock` lacks an export it uses now names the mock and the export.** Previously only the package's own line was reported, for example `(0 , _expoModulesCore.requireOptionalNativeModule) is not a function` when `expo-constants` loads under a partial `jest.mock('expo-modules-core')`. The error is now `JEST_MOCK_MISSING_EXPORT`, with the original as its cause.

Add the export to the mock, or build the mock on the real module: `jest.mock('x', () => ({ ...jest.requireActual('x'), … }))`.

- The export is never filled in. The mock stays the whole module, as under Jest.
- Not covered: `vi.mock`, and a package that destructures its `require`.
