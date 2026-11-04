---
"vitest-native": minor
---

**Under the native engine, Reanimated 4.7+ (with Worklets 0.9+) is Reanimated's own test mock.** `react-native-reanimated` resolves to `react-native-reanimated/mock`, as a Jest suite gets it with `jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))`. No action needed; `presets: { reanimated: false }` turns it off. Older Reanimated or Worklets, and the mock engine, keep the hand-written preset.

- The hand-written preset lacked 104 of the mock's names, including `interpolateColor`, `clamp`, `Keyframe`, `useScrollOffset`, `Extrapolate`, most layout-animation presets, `Easing.exp`/`bounce`/`elastic`, `withReanimatedTimer` and `getAnimatedStyle`. It also called animation callbacks with `{ finished, current }` where Reanimated passes `true`.
- The mock loads the real package and `react-native-worklets` through the Jest resolvers both ship. The engine consults those resolvers only for those two packages' own files, so pnpm store neighbours and `react-native-worklets-core` are unaffected.
- Behaviour that now matches Jest with Reanimated's mock: a `useSharedValue` is a new `{ value }` each render; `makeMutable(x)` returns `x`; `cancelAnimation`, `scrollTo` and the other no-ops are plain functions, not `vi.fn`; `withReanimatedTimer` and `advanceAnimationByTime` need `jestCompatSetup`.
- With Worklets 0.9+ the worklets preset no longer applies: `runOnJS`, `runOnUI`, `scheduleOnRN` and `scheduleOnUI` run their worklet on a later tick, so a test that reads the result awaits it (`await waitFor(...)`). `presets: { worklets: true }` keeps the preset.
- The real package costs no extra per-file loading. Reanimated's and Worklets' module graphs, with the packages they depend on as their own, are precompiled into a second registry layered on React Native's, built and cached with it. A file that imports Reanimated loads none of their modules through Node and runs only the ones it reaches. Its Node module loads and resolutions stay within two of a file using the preset, stock and under `hotRuntime`.
