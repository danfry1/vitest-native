# A namespace import's .default of __esModule CommonJS is undefined

- **Class:** transform/resolution
- **Source:** #339 adversarial review
- **Fixed by:** open (outside #339's stated scope: the namespace form) (`origin/fix/esm-goal-import-interop`)
- **Needs:** nothing beyond this repository's install

## The bug

An ES-module file in node_modules that the engine compiles to CommonJS used Babel's interop helpers. For CommonJS that sets `__esModule` without a `default` (tslib's shape), Node gives an ES module's default import the whole `module.exports`; Babel's helper reads `exports.default` and gets undefined. `import * as ns` then `ns.default` is the same gap through the wildcard helper.

## Expected behaviour

`ns.default` is `module.exports`, as Node gives it.
