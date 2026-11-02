---
"vitest-native": patch
---

**Under the native engine, importing tslib, or any CommonJS that sets `__esModule` without a `default`, from a compiled ES module now works.** The default import is `module.exports`, as Node gives it, where it was `undefined` ("Cannot read properties of undefined (reading '__extends')"). No action needed.

This applies to files that are ES modules to Node (`.mjs`, or `"type": "module"`) and compiled without a project Babel config: a default import, a default import beside named ones (`import tslib, { __extends } from`), `export { default } from` and `import * as ns` (`ns.default`). A target with its own `default` still gives that default, as Metro does, where Node would give `module.exports`. Script-goal files keep Babel's interop. What else changes for such a target: `import * as ns` of it is now a separate object whose members read the module (one per module, shared by every importing file), so `typeof ns` is `"object"` even when the module is a function, and `vi.spyOn(ns, name)` no longer replaces the module's own member. In an import cycle, a default read at the top level while the target is still loading gets `module.exports`, a truthy object, where it was `undefined`.
