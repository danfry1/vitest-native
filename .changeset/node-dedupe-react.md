---
"vitest-native": minor
---

**An installed package with its own copy of React now gets the React your tests render with under the native engine.** Node used each package's nearest copy, so a package that nests React, such as a `use-sync-external-store` shim, ran its hooks against a React the renderer never set up. Node's `require` and `import` now serve React, `react-is` and the test renderers as one copy, the one `react-native` resolves, as Vite already did. No action needed with one copy of React. If the project or React Native Testing Library resolves another copy, the run fails with `PRESET_REACT_MISMATCH`: install one copy of `react`. `init` and `migrate` now write the same `resolve.dedupe` list.
