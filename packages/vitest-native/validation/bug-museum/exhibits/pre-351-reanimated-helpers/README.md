# Reanimated's pure helpers are no-ops under the engine

- **Class:** presets
- **Source:** issue #351 (a user's migration: ~50 s under Jest -> ~8 s)
- **Fixed by:** local branch fix/issue-351-own-library-mocks (no PR yet) (`fix/issue-351-own-library-mocks`)
- **Needs:** nothing beyond this repository's install

## The bug

Reanimated's interpolate, interpolateColor and clamp are pure functions, but both the hand-written preset and Reanimated 4.7's own Jest mock stub them (interpolate returns the first output value or undefined); `isSharedValue` and `css.keyframes` were missing. Components that compute styles from them rendered wrong values.

## Expected behaviour

The helpers compute what they compute on a device: interpolate(5, [0,10], [0,100]) = 50, clamp(5, 0, 3) = 3, interpolateColor gives an rgba(), isSharedValue recognises a shared value.

## Notes

The fix branch is local (not pushed): it is stacked on feat/library-jest-scope (GH and flash-list run as themselves) and #349. The jest.mock workarounds posted in #351 are not used here: the exhibit asserts the libraries work as installed.
