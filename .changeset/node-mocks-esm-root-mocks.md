---
"vitest-native": patch
---

**With `experimental.nodeMocks` on, a root `__mocks__` manual mock of an ES-module package reaches the installed packages that import it.** No action needed.

- A mock such as `__mocks__/multiformats/cid.js`, for a subpath that only `import` can resolve, failed the test file with "its factory is async and has not settled", though no test wrote an async factory. Installed packages that import it now get the mock, the same instance the test's own import gets.
- The `MOCK_NOT_SEEN_BY_NODE` message for an async factory that has not settled now gives its advice once.
