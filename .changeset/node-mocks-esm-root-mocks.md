---
"vitest-native": patch
---

**With `experimental.nodeMocks` on, a root `__mocks__` manual mock of an ES-module package reaches the installed packages that import it.** No action needed.

- A mock such as `__mocks__/multiformats/cid.js`, for a subpath only `import` can resolve, failed the test file with "its factory is async and has not settled", though no test wrote an async factory. Every import of the mocked file now gets the mock, the same instance the test's own import gets.
- This includes the package's own relative imports of that file, which differs from Jest: Jest matches a root `__mocks__` mock by module name, so a package reaching the file by a relative path gets the real module there.
- A `jest.mock` factory written `async` for such a subpath now fails an import from installed packages by name (`MOCK_NOT_SEEN_BY_NODE`) while it has not settled, instead of loading an empty module.
- The `MOCK_NOT_SEEN_BY_NODE` message for an async factory that has not settled now gives its advice once.
