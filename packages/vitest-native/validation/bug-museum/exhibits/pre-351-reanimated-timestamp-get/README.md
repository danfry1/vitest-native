# Reanimated's mock gives useTimestamp a value without get()

- **Class:** presets
- **Source:** #351 (a user's app on 0.15.0-rc.1)
- **Fixed by:** open
- **Needs:** nothing beyond this repository's install

## The bug

Under the native engine `react-native-reanimated` is Reanimated's own test mock, whose `useTimestamp` returns `{ value: 0 }`. Reanimated 4's shared values are read with `.get()`, so an app that reads the timestamp that way failed with `TypeError: … .get is not a function`. The engine already corrected `useScrollOffset` and `useScrollViewOffset`, which the mock answers the same way.

## Expected behaviour

`useTimestamp` returns a shared value, as `useSharedValue` does.
