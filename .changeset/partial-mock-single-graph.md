---
"vitest-native": patch
---

A Jest partial mock of project source, `jest.mock(p, () => ({ ...jest.requireActual(p), x: jest.fn() }))`, now shares module state with the rest of the test file. `jestMockTransform()` loads a factory's own `jest.requireActual` of project source through Vite (`vi.importActual`), where it used to load a second copy through Node whenever Vite had not yet evaluated the module: the real members then read a store that the app code never wrote, depending on import order. Regex `resolve.alias` entries now work in that position as well. A `require()` or `jest.requireMock` of the mocked module still returns the mock object, and a CommonJS module still comes back as its `module.exports`. A `jest.requireActual` inside a function the factory returns is unchanged.
