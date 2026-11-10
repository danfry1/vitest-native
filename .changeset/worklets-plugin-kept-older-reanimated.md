---
"vitest-native": patch
---

**A Reanimated mock that spreads `jest.requireActual('react-native-reanimated')` works on Reanimated 4.5 and 4.6.** On those versions the engine dropped the project's `react-native-worklets/plugin` (and the one `babel-preset-expo` adds), so the real `useAnimatedStyle` threw "used without a dependency array or Babel plugin" where Jest passed. The plugin is now applied whenever Reanimated or Worklets is installed. No action needed.
