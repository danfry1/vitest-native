---
"vitest-native": patch
---

**Native engine: a deep import of a preset package, such as `react-native-reanimated/src/common/style/propsBuilder`, now loads that real file.** It used to get the package's whole root mock, so its named exports were `undefined`. Change a deep import that relied on getting the root mock to import from the package root.

- As under Jest, where `jest.mock(pkg)` leaves a package's subpaths alone.
- A subpath whose last segment the mock exports, such as `react-native-gesture-handler/Swipeable`, still gets that export. The mock engine is unchanged.
