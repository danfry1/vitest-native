---
"vitest-native": patch
---

Native engine: stub asset `require()`s reaching Node's CJS loader. A literal
`const img = require('./logo.png')` (common in real RN components) escapes Vite's
asset handling and hits Node's loader, where the binary was compiled as JS and
threw `SyntaxError: Invalid or unexpected token`, taking down the whole test file.
The Node require-hook now stubs image/media asset extensions to their basename
string, matching the Vite graph and Metro/Jest behaviour.

Font extensions (`.ttf`/`.otf`/`.woff`/`.woff2`) are intentionally left
unstubbed on this path: font loaders such as `@react-native-vector-icons`
inspect the `require()` result, and a basename-string stub makes them proceed
past their availability guard and crash on the boundary-mocked native font
module. Leaving the font require to normal resolution preserves their graceful
degradation.

Surfaced by a real bake-off of the `@rneui/base` (react-native-elements) Jest +
RNTL suite under the native engine.
