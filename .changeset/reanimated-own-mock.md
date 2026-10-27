---
"vitest-native": minor
---

Under the native engine, with Reanimated 4.7 or later, `react-native-reanimated` is Reanimated's own test mock (`react-native-reanimated/mock`), as a Jest suite gets it with `jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))`. The hand-written preset lacked 104 of the names that mock provides (`interpolateColor`, `clamp`, `Keyframe`, `useScrollOffset`, `Extrapolate`, most layout animation presets, `Easing.exp`/`bounce`/`elastic`, and its test helpers `withReanimatedTimer` and `getAnimatedStyle`), and called animation callbacks with `{ finished, current }` where Reanimated passes `true`, so `if (finished)` code paths did not run as on a device. On an Expo SDK 58 app, every probe of reanimated matches Jest with Reanimated's mock except `Animated.View`'s shape, which wraps real React Native's `View`.

The mock loads the real package and `react-native-worklets` in their JS implementations, through the Jest resolvers both libraries ship (from Reanimated 4.7 and Worklets 0.9), which the native engine now applies to their files. With an older Reanimated or Worklets, and under the mock engine, the existing presets stay.

What a suite on the preset sees change, each as under Jest with Reanimated's mock:

- A `useSharedValue` is a new `{ value }` on every render, so a value set before a re-render does not survive it; `makeMutable(x)` returns `x`, and `useAnimatedKeyboard()` returns plain numbers.
- `cancelAnimation`, `scrollTo` and the other no-op functions are plain functions, not `vi.fn`, so `toHaveBeenCalled` on them fails.
- `withReanimatedTimer` and `advanceAnimationByTime` use Jest's fake timers and need the jest-compat layer (`jestCompatSetup`).
- Under the native engine the worklets preset no longer applies with Worklets 0.9 or later: `runOnJS`, `runOnUI`, `scheduleOnRN` and `scheduleOnUI` run their worklet on a later tick, as the real package does under Jest, where the preset ran it synchronously, so a test that reads the result awaits it (`await waitFor(...)`). `presets: { worklets: true }` keeps the preset.

A file that imports reanimated now loads the real package beneath the mock, about 75–125 ms more per file (measured on 24 such files, hot runtime and stock). `presets: { reanimated: false }` turns the preset off; the real package then loads in its JS implementation, but hooks such as `useAnimatedStyle` need the worklets Babel plugin, which the engine does not apply to app code.
