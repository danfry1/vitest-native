---
"vitest-native": minor
---

Add a built-in `vectorIcons` preset for `@react-native-vector-icons` (v10+),
auto-detected like the other third-party presets.

The library's v10 icon sets (`@react-native-vector-icons/material-icons`, …) are
all built on the shared `@react-native-vector-icons/common` module, whose dynamic
font loader runs at import time and queries the native `ExpoFontLoader` — which
cannot exist in Node. Without shadowing, importing any icon set throws and the set
is wrongly reported "not available", so icons render nothing. The preset shadows
the single `common` module (the way jest mocks vector-icons) so `createIconSet(...)`
returns a lightweight Text-based stub that forwards `name`/`size`/`color`/`style`/
`testID` — fixing every icon set at once. The legacy `react-native-vector-icons`
package is mapped to the same preset.

Surfaced by the `@rneui/base` bake-off, where every `Icon` test failure traced to
this import-time crash.
