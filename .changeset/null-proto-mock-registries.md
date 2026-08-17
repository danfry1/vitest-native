---
"vitest-native": patch
---

Mock registries are null-prototype objects, so a module or package name of `__proto__` becomes an ordinary entry instead of re-prototyping the registry. Hardens the published `mockNativeModule()` surface against prototype-polluting names — the same class CodeQL flagged on `extendPresetMock()`.
