---
"vitest-native": patch
---

**Native engine with `experimental: { ownershipModel: 'resolution' }`: Node's `require` of a project file gets Vite's own instance, whichever side loads it first.** No action needed.

- A file Vite has not evaluated yet is evaluated then, by Vitest, so a later `import` gets the same module.
- What cannot be served fails by name: top-level `await`, a module that throws, one Vite is still evaluating, or a mocked import inside it.
