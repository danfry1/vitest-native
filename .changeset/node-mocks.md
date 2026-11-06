---
"vitest-native": patch
---

**Native engine with `experimental: { nodeMocks: true }`: a `vi.mock` or `jest.mock` reaches modules Node loads, as `jest.mock` does under Jest.** To try it, set the flag.

- An installed package's `require` or `import` of a mocked module gets the test's mock, the same instance. This covers factories, automocks, `{ spy: true }` and `__mocks__` files.
- A mock Node cannot be handed synchronously fails by name, `MOCK_NOT_SEEN_BY_NODE`, instead of loading the real module. Examples are an async factory that has not settled, or a `vi.doMock` not yet applied.
