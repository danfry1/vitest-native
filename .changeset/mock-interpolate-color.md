---
"vitest-native": patch
---

**Reanimated's `interpolateColor` works under the mock engine.** It threw `PRESET_UNAVAILABLE` there with reanimated 4.x, because its file imports React Native, which the mock engine does not transform. When `interpolateColor` is first called, the preset now compiles reanimated's own file with the project's `@babel/core` and `@babel/plugin-transform-modules-commonjs`, which a React Native app has through its Babel preset. It returns what reanimated returns: RGB, HSV and LAB, with colour strings or numbers. A project without that Babel keeps the error, which now names the packages to install.
