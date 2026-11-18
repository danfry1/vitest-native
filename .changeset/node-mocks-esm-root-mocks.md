---
"vitest-native": patch
---

**With `experimental.nodeMocks` on, a root `__mocks__` mock of an ES-module package reaches the installed packages that import it.** No action needed.

- A mock such as `__mocks__/multiformats/cid.js` failed the file with "its factory is async and has not settled". Every import of it by name now gets the mock.
- An async `jest.mock` factory that has not settled now fails such an import by name, and the message gives its advice once.
