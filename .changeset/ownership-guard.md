---
"vitest-native": minor
---

The native engine now reports any file that both Node and Vite evaluate in one worker. Such a file exists twice, and state written through one copy is invisible to the other. Until now nothing said so. The report names the file, the policy owner, both evaluators, the route and the fix. `reactNative({ ownership })` sets what happens: `'warn'` (the default) reports each file once per worker, and `'error'` throws `MODULE_DUAL_EVALUATION` before the second copy is used. `ownership.allow` exempts a named file or directory, with a required reason. `VITEST_NATIVE_OWNERSHIP_MODE` overrides the mode for a whole run. The default becomes `'error'` in the next minor. jest-compat's `require` of a CommonJS project file the test already imported now returns that same `module.exports`, where it used to load a second copy. See docs/ownership-guard.md.
