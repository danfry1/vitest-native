---
"vitest-native": minor
---

**A package that Vite and Node both load can now resolve to one file, behind a new opt-in flag.** Set `experimental: { ownershipModel: 'resolver' }` under the native engine to try it. Vite, Node's CommonJS loader, Node's ESM loader and the precompiled React Native registry then resolve every bare import through one shared resolver, built from one record in the project context.

- A package whose `exports` map has separate `import` and `require` builds loads its `require` build on both sides.
- A package without `exports` that sets a `react-native` field loads that file from Node's `require` too.
- RegExp aliases and tsconfig `paths` apply on Node's side as well, including in `jest.requireActual`.
- An alias Node cannot apply is refused at startup, by name.
- A realm that would resolve from different conditions fails with `RESOLVER_INPUT_MISMATCH`.
- A realm or project left without the resolver's inputs fails with `RESOLVER_INPUTS_MISSING`.

With `diagnostics: true`, each request that Node's `require`, or Vite, answers differently from before is written to a file the run names. The flag is off by default, and nothing changes without it. See `docs/ownership-model.md`.
