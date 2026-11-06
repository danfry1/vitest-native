---
"vitest-native": minor
---

**Native engine: a new opt-in flag makes Vite and Node resolve a package to the same file, so one package is one module.** Add `experimental: { ownershipModel: 'resolver' }` to try it. Nothing changes without it.

- Any package with separate `import` and `require` builds, or a `react-native` field, loads one file on both sides; a JSX or Flow `react-native` field is compiled, as Metro does.
- RegExp aliases and tsconfig `paths` also apply to Node's `require`, including `jest.requireActual`. `NODE_PATH` applies to `require` only, as in Node.
- Not covered: an alias with a custom resolver or a function replacement. It is refused at startup by name. See [`experimental`](https://danfry1.github.io/vitest-native/guide/plugin-options#experimental).
