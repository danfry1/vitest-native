---
"vitest-native": patch
---

**Native engine with `experimental: { ownershipModel: 'resolution' }`: mocks apply to modules Node's `require` reaches, as they do to the test's imports.** No action needed.

- Node's `require` of a mocked file gets the test's mock, and a module evaluated for Node's `require` gets the test's mock for each mocked import.
- A mock that cannot be had synchronously (an async factory that has not settled, a `vi.doMock` not applied yet) fails by name: `MOCK_NOT_SEEN_BY_NODE`.
