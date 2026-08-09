---
"vitest-native": patch
---

Update `magic-string` to 1.x

`magic-string` is one of the package's two runtime dependencies, so the major bump
changes what consumers install. The four methods the `jest.mock` hoisting transform
uses — `overwrite`, `appendLeft`, `appendRight`, and `generateMap` — are unchanged in
behaviour, and the hoisting suite passes against the new version.
