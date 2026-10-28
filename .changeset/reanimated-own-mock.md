---
"vitest-native": minor
---

**Under the native engine, Reanimated 4.7+ (with Worklets 0.9+) is Reanimated's own test mock.** `react-native-reanimated` resolves to `react-native-reanimated/mock`, as a Jest suite gets it with `jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))`. No action needed; `presets: { reanimated: false }` turns it off. Older Reanimated or Worklets, and the mock engine, keep the hand-written preset.

- The hand-written preset lacked 104 of the mock's names, including `interpolateColor`, `clamp`, `Keyframe`, `useScrollOffset`, `Extrapolate`, most layout-animation presets, `Easing.exp`/`bounce`/`elastic`, `withReanimatedTimer` and `getAnimatedStyle`. It also called animation callbacks with `{ finished, current }` where Reanimated passes `true`.
- The mock loads the real package through the Jest resolvers Reanimated and Worklets ship. The engine consults those resolvers only for those two packages' own files, so pnpm store neighbours and `react-native-worklets-core` are unaffected.
- Behaviour that now matches Jest with Reanimated's mock: a `useSharedValue` is a new `{ value }` each render; `makeMutable(x)` returns `x`; `cancelAnimation`, `scrollTo` and the other no-ops are plain functions, not `vi.fn`.
- Not covered yet: per-file cost. A file that imports Reanimated loads the real package beneath the mock, about 340 more modules evaluated per file than the preset (Reanimated 295, Worklets 21), stock and under `hotRuntime` alike.
