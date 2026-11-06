---
"vitest-native": patch
---

**JSX in your project's own `.js` files now compiles, as Metro and babel-jest compile it.** A `jest.setup.js` that renders a provider, a `.js` test, or a `.js` component imported by a test used to fail with `Failed to parse source for import analysis`. Remove any rename to `.jsx` or `oxc.include` override added as a workaround. Files in `node_modules` are unchanged; packages that ship JSX in `.js` still go in [`transform`](https://danfry1.github.io/vitest-native/guide/plugin-options#transform).
