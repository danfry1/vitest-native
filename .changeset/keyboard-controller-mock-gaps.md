---
"vitest-native": patch
---

**react-native-keyboard-controller's `useAnimatedKeyboard`, `KeyboardState`, `KeyboardContext`, `KEYBOARD_BORDER_RADIUS`, `KEYBOARD_HAS_ROUNDED_CORNERS` and `KeyboardController.setTranslucent` exist under the native engine.** The library's own Jest mock, which the engine serves, leaves them out. Its shared values also lacked listeners and `modify()`, and `useKeyboardContext()` returned the animation values only. The engine now adds what the mock lacks: shared values with Reanimated 4's shape, and a `useKeyboardContext()` that reads `KeyboardContext` with the package's default. No action needed.
