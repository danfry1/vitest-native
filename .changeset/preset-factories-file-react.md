---
"vitest-native": patch
---

**`hotRuntime.freshRuntime` now works with vitest-native's presets, so it no longer declines when one that uses React is active.** Each preset builds its mock with the test file's own React, so every file renders through presets such as navigation, reanimated or safe-area with its own React, and their hooks and contexts work in every file. A preset module's factory now receives `{ React }` (`PresetFactoryContext`). No action needed for vitest-native's presets. Change a custom preset whose factory makes components, contexts or hooks to use that React instead of one imported at the module's top level: `factory: ({ React }) => …`.
