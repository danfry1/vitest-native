---
"vitest-native": patch
---

Under the native engine, an ES module in a compiled package now gets a CommonJS module's `module.exports` as its default import when that module sets `__esModule` without a `default` export, as Node gives it. Such imports were `undefined` before: tslib's Node ESM wrapper (`import tslib from '../tslib.js'`), which styled-components/native reaches, failed with "Cannot read properties of undefined (reading '__extends')". A target with its own `default` export, whether an ES module or Babel-compiled CommonJS, still gives that default, as Metro does.
