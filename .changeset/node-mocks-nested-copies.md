---
"vitest-native": patch
---

**With `experimental.nodeMocks` on, a root `__mocks__` mock of an ES-module package also reaches nested copies of that package.** No action needed.

- A package with its own copy of `multiformats` in its `node_modules` got the real `multiformats/cid`, with no warning, while the rest of the app got `__mocks__/multiformats/cid.js`. Every copy now gets the mock, as under Jest.
- A `jest.mock` with a factory still applies to the copy the test file resolves, as it does under Jest.
