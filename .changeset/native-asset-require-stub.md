---
"vitest-native": patch
---

Native engine: stub asset `require()`s reaching Node's CJS loader. A literal
`const img = require('./logo.png')` or `require('./Icon.ttf')` (common in real RN
components) escapes Vite's asset handling and hits Node's loader, where the binary
was compiled as JS and threw `SyntaxError: Invalid or unexpected token`, taking
down the whole test file. The Node require-hook now stubs asset extensions
(images, media, and fonts) to their basename string, matching the Vite graph and
Metro/Jest behaviour.

Surfaced by a real bake-off of the `@rneui/base` (react-native-elements) Jest +
RNTL suite under the native engine.
