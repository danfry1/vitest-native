---
"vitest-native": minor
---

**`jestMockTransform()` applies a root `__mocks__/<package>` to that `node_modules` package, as Jest does.** Jest applies such a file with no `jest.mock()` call. Under vitest-native the real package ran instead, so a suite with `__mocks__/moti.ts` loaded the real moti. `migrate` now lists each of these files, and passes Jest's `roots` on as `jestMockTransform({ roots })`.

No action needed. A package a preset covers keeps its preset; `jestMockTransform({ rootMocks: false })` turns this off.
