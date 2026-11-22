---
"vitest-native": patch
---

**`jest.mock`, `jest.unmock` and root `__mocks__` mocks now apply to each installed copy of a package as under Jest.** No action needed.

- With `experimental.nodeMocks`, a `jest.mock` factory for a dual `import`/`require` subpath now reaches imports from installed packages, instead of failing with "its factory is async and has not settled".
- A factory or `jest.unmock` changes only the copy the test file resolves; other copies, including workspace links, keep the `__mocks__` file.
- A package's own relative import of a root-mocked file now gets the real module, as under Jest.
