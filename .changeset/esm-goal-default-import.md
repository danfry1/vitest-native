---
"vitest-native": patch
---

**An ES module the native engine compiles gets `module.exports` as its default import of CommonJS that has no `default`, as Node gives it.** Importing `tslib` from a test or app file no longer fails with "Cannot read properties of undefined (reading '__extends')" when tslib is in the compile set. No action needed.

This applies to files that are ES modules to Node (`.mjs`, or `"type": "module"`) and compiled without a project Babel config. It covers a default import, a default import beside named ones (`import tslib, { __extends } from`), `export { default } from` and `import * as ns` (`ns.default`). A target with its own `default` (an ES module, or Babel-compiled CommonJS) still gives that default, as Metro does, where Node would give `module.exports`. The `default` is read when it is used, so an import cycle and a Proxy-served module see the value they end up serving. Script-goal files keep Babel's interop.
