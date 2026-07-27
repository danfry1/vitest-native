---
"vitest-native": patch
---

Cover the native-stack surface in the screens preset

A real native-stack never reached `onReady`, so the screen stayed empty with nothing
thrown, until the project shipped its own mock of react-native-screens. The preset
declared 12 exports where the package has 26.

The gap was closed against react-native-screens 4.26.2's published type surface
rather than against the names that had been noticed missing — the report named six,
and checking the package found sixteen. `ScreenStackItem` is the one that matters
most, since native-stack renders through it.

`ScreenContext` is a real React context rather than a component stub, because
native-stack calls `useContext` on it, and `useTransitionProgress` returns a progress
shape rather than an empty mock. The v3 names `NativeScreen` and
`NativeScreenContainer` are kept so a project on the older major does not lose them.

Not covered: `RNSScreensRefContext` and `GHContext`, which are not entry-point
exports — they live in the package's `contexts` module and are reached by deep
import.
