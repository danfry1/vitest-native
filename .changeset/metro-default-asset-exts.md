---
"vitest-native": patch
---

**Every extension Metro resolves as an asset by default is an asset in tests too, so expo-router's Android toolbar loads.** No action needed. The default asset extensions now include all of Metro's (`xml`, `pdf`, `html`, `yaml`, `yml`, `zip`, `psd`, `m4v`, `mpeg`, `mpg`, `aiff`, `caf` were missing), plus the image and font types vitest-native already added. A `require('./icon.xml')`, which expo-router's Android toolbar makes for its vector drawables, failed with `SyntaxError: Unexpected token '<'` because the file was compiled as JavaScript; it now registers as an asset, as in an app built with Metro.
