# Gesture Handler 3's components need hand-written jest.mocks

- **Class:** presets
- **Source:** issue #351 (a user's migration: ~50 s under Jest -> ~8 s)
- **Fixed by:** local branch fix/issue-351-own-library-mocks (no PR yet) (`fix/issue-351-own-library-mocks`)
- **Needs:** nothing beyond this repository's install

## The bug

The reporter needed three `jest.mock`s in a setup file before Gesture Handler 3 rendered: `src/RNGestureHandlerModule` -> `src/mocks/module`, the v3 `Touchable`, and the v3 `GestureComponents`. The root cause was not Gesture Handler: GH 3 calls `Reanimated.isSharedValue` / `useComposedEventHandler` / `useEvent` / `useHandler`, which the hand-written reanimated preset lacked ("is not a function").

## Expected behaviour

Gesture Handler 3's root view, Touchable, ScrollView and FlatList render with no user mocks.

## Notes

The fix branch is local (not pushed): it is stacked on feat/library-jest-scope (GH and flash-list run as themselves) and #349. The reporter's own jest.mock workarounds are not used here: the exhibit asserts the libraries work as installed.
