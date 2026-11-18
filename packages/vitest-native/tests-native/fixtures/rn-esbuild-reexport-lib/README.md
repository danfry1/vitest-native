A package built the way tsup/esbuild builds React Native component libraries (the
@rn-primitives packages, for one): CommonJS whose index re-exports a module with
`__reExport(…, require("./badge"))` and a `0 && (module.exports = { ...require("./badge") })`
hint, and whose modules keep their JSX (`jsx: preserve`). Node reads a re-exported file
from disk to find its names, so it cannot read badge.js's JSX there; see
tests-native/esbuild-reexport-jsx.test.tsx.
