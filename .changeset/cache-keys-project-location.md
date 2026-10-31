---
"vitest-native": patch
---

**Copying or moving a project no longer reuses caches from its old location.** Under the native engine, a checkout copied together with `node_modules/.cache/vitest-native` reused the original's precompiled React Native registry, which loads React Native from the original checkout, so every test failed with "more than one copy of React" until the cache was deleted. No action needed: a copy now builds its own registry on its first run.

- The registry key and the key vitest-native adds to Vitest 5's `fsModuleCache` now include the project's real path.
- A symlinked path to the same project resolves to the same real path, so it keeps its cache.
- A moved checkout was already rebuilt, because the original's files were gone. It now gets a new key directly.
