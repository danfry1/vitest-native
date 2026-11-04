---
"vitest-native": patch
---

**Under the native engine, a package whose `react-native` field and `main` name different files is one module, imported or required.** A bare `require` now resolves the `react-native` field, as Metro and an `import` already did, for a package the engine compiles (one that depends on React Native) or a TypeScript entry. No action needed.

- Before, a `require` read `main` and loaded a second copy, so a library requiring the package and a test importing it held separate state (`react-native-worklets` was loaded twice: `src/index.ts` and `lib/module/index.js`).
- `jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))` works: the mock's own import of `./index` gets the real module, as under Jest, which mocks `main`.
- A package the engine does not compile keeps `main`, and `require.resolve` with `paths` is unchanged.
