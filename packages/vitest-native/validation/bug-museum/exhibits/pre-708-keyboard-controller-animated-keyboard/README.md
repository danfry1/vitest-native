# keyboard-controller's useAnimatedKeyboard is missing

- **Class:** presets
- **Source:** #708
- **Fixed by:** open
- **Needs:** nothing beyond this repository's install

## The bug

Under the native engine, react-native-keyboard-controller is its own Jest mock. That mock leaves out `useAnimatedKeyboard`, the compat hook the package documents for migrating from Reanimated's, and other public API: `KeyboardState`, `KeyboardContext`, the rounded-corner constants and `KeyboardController.setTranslucent`. Its shared values also lack listeners and `modify()`. A component that used the hook failed with `useAnimatedKeyboard is not a function`.

## Expected behaviour

`useAnimatedKeyboard()` gives a height and a state as shared values, at 0 and `KeyboardState.UNKNOWN`, as before any keyboard event.
