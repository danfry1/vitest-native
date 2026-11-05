---
"vitest-native": patch
---

**Native engine with `experimental: { ownershipModel: 'resolution' }`: a `require` back into a module from inside its own evaluation gets its exports so far, as in Node and Jest.** No action needed.

- This covers a Node-loaded library that a module imports and that requires the module back, directly or through another project file.
- A `require` of a module still evaluating for an unrelated reason fails by name, as before.
