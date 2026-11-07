---
"vitest-native": minor
---

**Behaviour change: `jestMockTransform()` applies Jest's manual mocks of `node_modules` packages.** To keep the previous behaviour, pass `jestMockTransform({ rootMocks: false })`. A file such as `__mocks__/moti.ts` in a `__mocks__` folder under Jest's `roots` now replaces that package with no `jest.mock()` call, as under Jest, for imports and `require()` alike, `__mocks__/react-native.js` included. Before, the real package ran. A setup file's or test file's own `jest.mock()` or `jest.unmock()` still wins.

- `migrate` lists each such file and carries over Jest's `roots` and `modulePathIgnorePatterns`.
- A package a preset covers keeps its preset; the run warns that its manual mock is not applied.
