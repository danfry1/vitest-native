# An ES module's default import of __esModule CommonJS is undefined

- **Class:** transform/resolution
- **Source:** migration testing (2026-10)
- **Fixed by:** #339 (draft) (`origin/fix/esm-goal-import-interop`)
- **Needs:** nothing beyond this repository's install

## The bug

An ES-module file in node_modules that the engine compiles to CommonJS used Babel's interop helpers. For CommonJS that sets `__esModule` without a `default` (tslib's shape), Node gives an ES module's default import the whole `module.exports`; Babel's helper reads `exports.default` and gets undefined. Found through styled-components/native importing tslib: `Cannot read properties of undefined (reading '__extends')`.

## Expected behaviour

The default import is `module.exports`, as Node gives it.
