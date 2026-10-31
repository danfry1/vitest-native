---
"vitest-native": patch
---

**A Jest partial mock of your own source shares module state with the rest of the test file, through a relative path or any alias.** With `jestMockTransform()`, `jest.mock(p, () => ({ ...jest.requireActual(p), x: jest.fn() }))` now loads the real module through Vite, so its real members read the same store or cache the app code writes, as under Jest. No action needed.

Before, `jest.requireActual` in the factory loaded a second copy through Node whenever Vite had not evaluated the module yet, so the real members silently read state the app never wrote. A regex `resolve.alias` failed with `REQUIRE_ACTUAL_ALIAS_UNSUPPORTED`; it now works there, as do string aliases and `resolve.tsconfigPaths`. A module the engine runs in Node (a detected workspace React Native package, a `transform` entry, a `server.deps.external` match) keeps the Node load. `require()` and `jest.requireMock` of the mocked module still return the mock, and a CommonJS module still comes back as its `module.exports`. A `jest.requireActual` inside a function the factory returns still loads a separate copy.
