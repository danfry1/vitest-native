---
"vitest-native": patch
---

**Native engine with `experimental: { ownershipModel: 'resolution' }`: a `require` back into a module from inside its own evaluation gets its exports so far, as in Node and Jest.** No action needed.

- This covers code the module's body is running, such as a Node-loaded library it calls, requiring it back, directly or through other files.
- A `require` from anywhere else (the test body, a timer) of a module still evaluating fails by name, as before.
