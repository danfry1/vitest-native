---
"vitest-native": patch
---

**Native engine with `experimental: { ownershipModel: 'resolver' }`: a worker's `require` and `import` share one resolver, so a package resolved once is not resolved again.** No action needed.

- A file removed since it was resolved, such as a nested copy uninstalled in watch mode, is resolved again by the same resolver.
- `NODE_PATH` applies to `require` only, as in Node.
