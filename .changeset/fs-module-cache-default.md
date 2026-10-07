---
"vitest-native": minor
---

On Vitest 5 the plugin turns on Vitest's persistent transform cache (`fsModuleCache`) unless the config sets it, and contributes its own part of the cache key through Vitest's cache key generator: the vitest-native version, the plugin's resolved options, and a digest of the project's lockfile. Vitest's own key does not cover plugin versions or what a plugin reads from disk, so without this an upgrade could serve modules transformed by the previous version. Warm runs of a 104-file production Expo suite were about 11% faster. Set `test.fsModuleCache: false` to opt out.
