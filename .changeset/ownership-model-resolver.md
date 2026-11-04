---
"vitest-native": minor
---

New opt-in `experimental: { ownershipModel: 'resolver' }`: under the native engine, Vite, Node's CommonJS loader and Node's ESM loader resolve every bare import through one shared resolver, built from one record in the project context, so a package loaded by both module systems is one module. A package whose `exports` map has separate `import` and `require` builds loads its `require` build on both sides, and a package without `exports` that sets a `react-native` field loads that file from Node's `require` too. An alias Node's loaders cannot apply is refused at startup, by name, and a realm that would resolve from different conditions fails with `RESOLVER_INPUT_MISMATCH`. Off by default; nothing changes without it. See docs/ownership-model.md.
