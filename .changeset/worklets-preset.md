---
"vitest-native": minor
---

Add a built-in `react-native-worklets` preset (auto-detected). Worklets is Reanimated's low-level runtime and is also imported directly by apps (e.g. `import { scheduleOnUI } from 'react-native-worklets'`). It ships a Jest mock at `react-native-worklets/lib/module/mock` that is ESM ending in `module.exports = …`; under the native engine React Native and its ecosystem are externalized, so requiring that file through Node throws `module is not defined in ES module scope` and takes down the whole test file. The preset shadows the package with a self-contained mock modelled on worklets' own `mock.js` API (schedulers run their worklet synchronously, matching the Reanimated preset), so worklets-using suites load and render without a hand-written mock.
