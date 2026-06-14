---
"vitest-native": patch
---

Native engine: fix `import { Appearance } from 'react-native'` (and other lazy-getter RN exports) failing with "does not provide an export named …" when the import comes from an **externalized ESM dependency**.

React Native's index exposes everything via lazy getters (`module.exports = { get Appearance() {…} }`), which `cjs-module-lexer` can't surface as named exports when Node imports the CommonJS module from the ESM graph. The Node ESM loader now serves RN's main index as a thin re-export of the real (Flow-stripped) module plus a `cjs-module-lexer`-recognized export hint, so named imports resolve while the real getters stay lazy (no eager load of RN's surface). The `require('react-native')` path is unchanged.

Previously this needed a manual `transform: ['the-lib']` workaround (e.g. for `uniwind`); that's no longer required. Surfaced by the obytes-template bake-off.
