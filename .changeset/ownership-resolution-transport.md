---
"vitest-native": patch
---

**Native engine: `experimental: { ownershipModel: 'resolution' }` is accepted, and for now resolves as `'resolver'` does.** No action needed.

- It starts the private channel the next step uses to give Node's `require` Vite's own instance of a project file.
- Not covered yet: the `require` behaviour itself.
