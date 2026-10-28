# A combined default + named import of __esModule CommonJS loses the default

- **Class:** transform/resolution
- **Source:** #339 adversarial review
- **Fixed by:** open (#339 fixes only the default-only form) (`origin/fix/esm-goal-import-interop`)
- **Needs:** nothing beyond this repository's install

## The bug

An ES-module file in node_modules that the engine compiles to CommonJS used Babel's interop helpers. For CommonJS that sets `__esModule` without a `default` (tslib's shape), Node gives an ES module's default import the whole `module.exports`; Babel's helper reads `exports.default` and gets undefined. `import tslib, { __extends } from ...` compiles through `interopRequireWildcard`, which #339 does not change, so the default is still undefined.

## Expected behaviour

The default import is `module.exports` and the named import is its member.
