# useAnimatedHeaderHeight is missing from the native-stack preset

- **Class:** presets
- **Source:** #828
- **Fixed by:** open
- **Needs:** nothing beyond this repository's install

## The bug

`@react-navigation/native-stack` exports `useAnimatedHeaderHeight()`, which gives a screen the header's height as an `Animated` value. The navigation preset's native-stack module left it out, so a screen that used it failed before it rendered.

## Expected behaviour

`useAnimatedHeaderHeight()` returns an `Animated.Value` from the engine's React Native, kept across renders. It starts at the height native-stack gives a card screen's header: 44 on an iOS phone in portrait, 56 on Android, with no top inset.
