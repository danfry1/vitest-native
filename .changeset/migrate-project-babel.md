---
"vitest-native": patch
---

**`vitest-native migrate` and `doctor` report the Babel plugins the engine applies itself, instead of wiring them into `babel()`.** With `projectBabel: 'auto'` (the default), the engine compiles files that need decorators, macros, the worklets plugin, inline environment variables or an unknown plugin with your Babel config, using your project's `@babel/core`. migrate lists each as applied and no longer adds `@rolldown/plugin-babel`. doctor says when `@babel/core` does not resolve, and calls a `babel()` entry that repeats one of them redundant. Delete a `babel()` entry that doctor reports as redundant.
