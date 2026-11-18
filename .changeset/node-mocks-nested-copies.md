---
"vitest-native": patch
---

**With `experimental.nodeMocks` on, a root `__mocks__` mock of an import-only subpath also reaches nested copies of its package.** No action needed.

- An import-only subpath is one whose `exports` entry has an `import` condition and no `require`, such as `multiformats/cid`. A package with its own nested copy of `multiformats` got the real `multiformats/cid` with no warning, while the rest of the app got `__mocks__/multiformats/cid.js`. Every installed copy now gets the mock, as under Jest.
- A `jest.mock` with a factory still applies only to the copy the test file resolves, as under Jest.
