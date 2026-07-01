---
"vitest-native": patch
---

Expand the "Migrating from Jest" guide with the empirically-derived limits of a real migration: a "Known limits" section covering assertions coupled to Jest's RN mock internals that don't port under a real-RN engine (`jest.spyOn(View.prototype, …)`, mocks of RN internal submodules, raw `source`-shape assertions, `jest.mock` nested in callbacks), an Expo-core caveat, and concrete guidance for the `transformIgnorePatterns` → `transform` allowlist (including the JSX-in-`.js` third-party-lib parse error and its fix).
