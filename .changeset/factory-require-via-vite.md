---
"vitest-native": patch
---

**A `jest.mock` factory that `require`s your own source now gets the module the test imports.** With `jestMockTransform()`, a `require('<path>')` in a factory's body loads through Vite, as its `jest.requireActual` calls already do, or returns the mock where the file mocks that module. It used to load a second copy through Node, with its own module state, and a SOURCE_EVALUATED_TWICE warning was printed for every file that copy imported: thousands of lines on a large suite. No action needed.
