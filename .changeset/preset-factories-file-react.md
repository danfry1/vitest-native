---
"vitest-native": patch
---

**`hotRuntime.freshRuntime` now works with vitest-native's presets, so it no longer declines when one that uses React is active.** No action needed for vitest-native's presets. Each preset builds its mock with the React `react-native` uses, the test file's own, so hooks and contexts work in every file. A preset module's factory now receives `{ React }` (`PresetFactoryContext`). Change a custom preset whose factory makes components, contexts or hooks to use it: `factory: ({ React }) => …`. Under the native engine, a project that resolves a second copy of React now fails with `PRESET_REACT_MISMATCH`.
