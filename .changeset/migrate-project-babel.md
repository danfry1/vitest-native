---
"vitest-native": patch
---

**`vitest-native migrate` and `doctor` report the Babel plugins the engine now applies itself, instead of wiring them into `babel()`.** With `projectBabel: 'auto'` (the default), the engine compiles the files that need decorators, macros, the worklets plugin, inline environment variables or an unknown plugin with your Babel config. migrate lists each as "applied by the engine" and no longer adds `@rolldown/plugin-babel` or asks you to install it. doctor marks them as applied rather than warning, and calls a `babel()` entry that repeats one of them redundant. The engine uses the project's `@babel/core`, so keep it as a devDependency; migrate and doctor say when it does not resolve. To tidy an existing config, delete a `babel()` entry that doctor reports as redundant.
