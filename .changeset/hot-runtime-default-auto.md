---
"vitest-native": minor
---

**The native engine reuses workers across test files by default.** `hotRuntime` now defaults to `'auto'`: where the run can be bounded, React Native loads once per worker, while each file still gets fresh modules, mocks and timers. Elsewhere, files keep a fresh worker each. A test that passes alone but fails after other files depends on state carried between them, and `vitest-native compare --hot` lists such tests.

To opt out, set `reactNative({ hotRuntime: false })`, which keeps 0.15's fresh worker per file.
