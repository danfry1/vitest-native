# Gesture Handler 3's components need hand-written jest.mocks

- **Class:** presets
- **Source:** issue #351 (a user's migration: ~50 s under Jest -> ~8 s)
- **Fixed by:** #500 (merged; #498, Gesture Handler runs as itself with its own Jest setup)
- **Needs:** nothing beyond this repository's install

## The bug

The setup posted in #351 needed three `jest.mock`s in a setup file before Gesture Handler 3 rendered: `src/RNGestureHandlerModule` -> `src/mocks/module`, the v3 `Touchable`, and the v3 `GestureComponents`. On main, Gesture Handler is the hand-written preset, which has no GH 3 surface: `Touchable` is undefined (and the v3 hooks are missing, which is also how `pre-351-gh3-shared-value-config` fails on main). Measured 2026-10-28: the exhibit passes once Gesture Handler runs as itself with its own Jest setup; #500 landed that.

## Expected behaviour

Gesture Handler 3's root view, Touchable, ScrollView and FlatList render with no user mocks.

## Notes

The fix landed in #500, which runs Gesture Handler and flash-list as themselves. The jest.mock workarounds posted in #351 are not used here: the exhibit asserts the libraries work as installed.
