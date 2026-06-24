---
"vitest-native": minor
---

Add built-in presets for `@shopify/flash-list`, `@gorhom/bottom-sheet`, and `react-native-keyboard-controller`.

These libraries rely on native runtimes (a native recycler, reanimated worklets, and keyboard native modules) that cannot run under Node, so before this they had to be mocked by hand. Each is now auto-detected when installed and shadowed by a self-contained preset under both engines: `FlashList` renders its data through `renderItem` so rows stay queryable, the bottom-sheet containers render their children through real React Native with no-op imperative refs, and the keyboard-controller containers render their children while `KeyboardController` and the reanimated-backed hooks return inert handles.
