---
"vitest-native": patch
---

**A root `__mocks__` mock of a package now reaches every installed copy of it, through `import` and `require`.** No action needed.

- A package with its own nested copy, such as a nested `multiformats`, got the real module with no warning, while the rest of the app got `__mocks__/multiformats/cid.js`. Every copy now gets the mock, as under Jest.
- With `experimental.nodeMocks` on, an `import` of a subpath with separate `import` and `require` files also gets the mock. Before, the `import` failed with "its factory is async and has not settled".
- A `jest.mock` with a factory still applies only to the copy the test file resolves, as under Jest.
