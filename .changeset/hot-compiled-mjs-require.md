---
"vitest-native": patch
---

**Under the hot runtime on Node 22, a React Native library whose ES index is an `.mjs` file beside CommonJS files now loads.** No action needed. Builds from esbuild and tsup publish this layout. vitest-native compiles the `.mjs` index, and its `require()` of a CommonJS sibling was served the ES wrapper meant for imports, which Node 22 failed to link (`ERR_VM_MODULE_LINK_FAILURE`: "is from a module not been linked"). Such a `require()` now returns the sibling's `module.exports`, the same instance the test file's own import of it reaches, and a new one in each file.
