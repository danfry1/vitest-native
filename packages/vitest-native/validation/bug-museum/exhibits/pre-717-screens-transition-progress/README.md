# useTransitionProgress returns numbers, not Animated values

- **Class:** presets
- **Source:** #717
- **Fixed by:** open
- **Needs:** nothing beyond this repository's install

## The bug

react-native-screens' `useTransitionProgress()` returns the three `Animated.Value`s a native-stack screen animates its transition with. The screens preset returned plain numbers, so a screen that interpolated `progress` into a style failed with `progress.interpolate is not a function`.

## Expected behaviour

`progress`, `closing` and `goingForward` are Animated values from the engine's React Native, starting at 0 as in the package, and a style can interpolate them.
