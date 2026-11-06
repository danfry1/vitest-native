---
"vitest-native": patch
---

**`vitest-native migrate` keeps the worklets Babel plugin where Reanimated runs as its own mock.** Under the native engine with Reanimated 4.7+ and Worklets 0.9+, `react-native-reanimated` is Reanimated's own mock, whose hooks need `react-native-worklets/plugin` (or `react-native-reanimated/plugin`); without it `useAnimatedStyle` throws "used without a dependency array or Babel plugin". migrate now wires the plugin through `babel()` from `@rolldown/plugin-babel` where that is installed, and otherwise lists it with the install step. With an older Reanimated or the mock engine it is still dropped. Add `babel({ plugins: ['react-native-worklets/plugin'] })` to the `plugins` of a config `migrate` generated before this release with Reanimated 4.7+.
