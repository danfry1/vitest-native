# Gesture Handler 3's buttons cannot be pressed from Testing Library

- **Class:** presets
- **Source:** #351 (a user's app on 0.15.0-rc.4)
- **Fixed by:** open
- **Needs:** nothing beyond this repository's install

## The bug

Under the native engine `react-native-gesture-handler` runs as itself with its own `jestSetup.js`, which leaves the native button host real. Gesture Handler 3's `Touchable` passes its callbacks to that host as `onButtonPress*`, and `RectButton` and `BorderlessButton` press through a native gesture's state changes, so Testing Library's `userEvent.press` found nothing to press, and `fireEvent.press` missed `RectButton`. An app's themed `withUnistyles(Touchable)` buttons needed a `vi.mock` replacing `Touchable` with React Native's `Pressable`.

## Expected behaviour

The buttons press as on a device: `userEvent.press` and `fireEvent.press` call `onPress` once, and a disabled button takes the press without calling it.
