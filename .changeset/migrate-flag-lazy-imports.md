---
"vitest-native": patch
---

**`vitest-native migrate` now warns when the project's Babel config makes imports lazy under Jest.** With `babel-preset-expo`'s `lazyImports`, `@react-native/babel-preset`'s `lazyImportExportTransform`, the CommonJS transform's `lazy` option or an inline-requires plugin, Jest ran a package import only when a test first used it, while vitest-native runs every import when its file loads. A module a test never touched is then evaluated, and a partial `jest.mock` of something it needs can fail. The report now lists the setting under "Needs your attention". Babel plugin names under the `@babel/` scope are also now read the way Babel reads them.

Use `jest.requireActual` to give such a mock the rest of its module: `jest.mock('x', () => ({ ...jest.requireActual('x'), ... }))`.
