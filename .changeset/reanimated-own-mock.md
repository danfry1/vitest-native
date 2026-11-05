---
"vitest-native": minor
---

**Under the native engine, Reanimated 4.7+ (with Worklets 0.9+) is Reanimated's own test mock**, as a Jest suite installs it with `jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))`. No action needed; `presets: { reanimated: false }` turns it off, and older versions keep the hand-written preset.

- The hand-written preset lacked 104 of the mock's names, among them `interpolateColor`, `Keyframe`, `useScrollOffset` and most layout animations.
- Worklets is its own test mock too, so a test and Reanimated share one instance; its `runOnJS` and `scheduleOnRN` run a tick later, as under Jest.
- Both mocks are precompiled with React Native's modules, so a file that imports Reanimated loads about as fast as with the preset.
