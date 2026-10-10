---
"vitest-native": patch
---

Preset mocks keep their behaviour through `vi.resetAllMocks()` and `mockReset: true`. A gesture-handler gesture built before a reset, such as `Gesture.Pan()` at module scope, keeps chaining. In the mock engine, `Platform.select()` follows `Platform.OS` after a reset, so a setup file's `setPlatform('android')` is no longer undone for `select()` while `Platform.OS` stays `"android"`. `Platform.select()` also picks by key presence, as React Native does, so an explicit `ios: undefined` selects `undefined`.
