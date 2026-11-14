---
"vitest-native": patch
---

**`vitest-native migrate` keeps a suite that ran the real Reanimated on the real library.** A Jest setup that calls Reanimated's `setUpTests()` and mocks Reanimated nowhere ran the real library, but migrate called that setup file covered and suggested deleting it, which moved the suite onto the preset's mock, where `getAnimatedStyle` returns `{}`. Migrate now writes `presets: { reanimated: false }` for such a suite and keeps its setup file; "delete" stays for suites that also mock Reanimated. The [presets guide](https://vitest-native.danfry.dev/guide/presets#reanimated-its-mock-or-the-real-library) shows the two modes side by side (#834).

Add `presets: { reanimated: false }` where your Jest setup ran `setUpTests()` without mocking Reanimated, and keep that setup file.
