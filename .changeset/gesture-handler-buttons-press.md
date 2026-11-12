---
"vitest-native": patch
---

**Gesture Handler 3's `Touchable`, `RectButton` and `BorderlessButton` can be pressed from Testing Library under the native engine.** `userEvent.press` and `fireEvent.press` now call `onPress` once, as a tap on a device does, and a disabled button takes the press without calling it. Before, `userEvent` found nothing to press and `fireEvent` missed `RectButton`. The engine now mocks the native button host beside the package's own `jestSetup.js`, following its `testOnly_onPress` convention. Delete a `vi.mock` that replaced `Touchable` with `Pressable` for this.
