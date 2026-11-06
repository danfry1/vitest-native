---
"vitest-native": minor
---

**Native engine: `experimental: { ownershipModel: 'resolution' }` gives Node's `require` of a project file the same instance a test's `import` gets, whichever loads it first.** To try it, set the flag; it also turns on `nodeMocks`.

- A file Vite has not evaluated yet is evaluated then, so a later `import` gets the same module. A `require` back into a module from inside its own evaluation gets its exports so far, as in Node and Jest.
- Mocks apply to what Node's `require` reaches, as to the test's imports.
- What cannot be served fails by name: top-level `await`, a module that throws, one still evaluating when required from elsewhere, or a mock not available synchronously (`MOCK_NOT_SEEN_BY_NODE`).
