# useAnimatedScrollHandler never calls the handler; useScrollOffset is not a shared value

- **Class:** presets
- **Source:** issue #351 (a user's migration: ~50 s under Jest -> ~8 s)
- **Fixed by:** local branch fix/issue-351-own-library-mocks (no PR yet) (`fix/issue-351-own-library-mocks`)
- **Needs:** nothing beyond this repository's install

## The bug

The preset's and Reanimated 4.7's own `useAnimatedScrollHandler` return a no-op, so a component reacting to scroll never sees an event; the own mock's `useScrollOffset` returns `{ value: 0 }`, not a shared value (no `.get()`).

## Expected behaviour

A scroll event fired at an Animated.ScrollView reaches the handler's onScroll with the native event; useScrollOffset returns a shared value.

## Notes

The fix branch is local (not pushed): it is stacked on feat/library-jest-scope (GH and flash-list run as themselves) and #349. The reporter's own jest.mock workarounds are not used here: the exhibit asserts the libraries work as installed.
