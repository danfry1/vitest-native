# Gesture Handler 3's components need hand-written jest.mocks

- **Class:** presets
- **Source:** issue #351 (a user's migration: ~50 s under Jest -> ~8 s)
- **Fixed by:** local branch feat/library-jest-scope (Gesture Handler runs as itself; no PR yet) (`feat/library-jest-scope`)
- **Needs:** nothing beyond this repository's install

## The bug

The reporter needed three `jest.mock`s in a setup file before Gesture Handler 3 rendered: `src/RNGestureHandlerModule` -> `src/mocks/module`, the v3 `Touchable`, and the v3 `GestureComponents`. On main, Gesture Handler is the hand-written preset, which has no GH 3 surface: `Touchable` is undefined (and the v3 hooks are missing, which is also how `pre-351-gh3-shared-value-config` fails on main). Measured 2026-10-28: the exhibit passes once Gesture Handler runs as itself with its own Jest setup (feat/library-jest-scope, which the #351 branch is stacked on), so that branch is its fix.

## Expected behaviour

Gesture Handler 3's root view, Touchable, ScrollView and FlatList render with no user mocks.

## Notes

The fix branch is local (not pushed): it is stacked on feat/library-jest-scope (GH and flash-list run as themselves) and #349. The reporter's own jest.mock workarounds are not used here: the exhibit asserts the libraries work as installed.
