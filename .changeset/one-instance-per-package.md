---
"vitest-native": patch
---

**Under the native engine, a package whose `react-native` field and `main` name different files is one module, imported or required.** A bare `require` now resolves the `react-native` field, as Metro and an `import` already did. No action needed.

- Before, a `require` read `main` and loaded a second copy, so a library requiring the package and a test importing it held separate state (`react-native-worklets` was loaded twice: `src/index.ts` and `lib/module/index.js`).
- A whole-package `jest.mock` (for example `jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))`) is not served to the package's own relative import of its entry, so the factory does not require itself.
