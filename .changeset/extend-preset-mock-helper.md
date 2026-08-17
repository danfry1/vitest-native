---
"vitest-native": minor
---

New helper `extendPresetMock(pkg, overrides)`: merge overrides into a preset's module mock (and its `default` export) — e.g. to give expo-constants a real `expoConfig` or add an export a library calls that the preset does not model. Undone by `resetAllMocks()`.
