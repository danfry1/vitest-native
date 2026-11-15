# Reanimated's interpolateColor throws under the mock engine

- **Class:** presets
- **Source:** #857
- **Fixed by:** open
- **Needs:** nothing beyond this repository's install

## The bug

Under the mock engine, the reanimated preset serves reanimated's own `interpolate`, `clamp` and `interpolateColor`, loaded from the installed package. With reanimated 4.x, `interpolateColor`'s file reaches React Native's `Platform`, whose Flow source the mock engine does not transform. The preset served a function that threw `PRESET_UNAVAILABLE`, so a component that animated a colour failed.

## Expected behaviour

`interpolateColor` returns what reanimated returns: halfway from `#ff0000` to `#0000ff` is `rgba(186, 0, 186, 1)`.
