---
"vitest-native": patch
---

**Under the hot runtime, an ES module dependency that imports a preset package now sees the running test file's preset mock, not the first file's.** Before, from the second file on a hot worker, such a dependency read another file's mock: `mockReturnValue`, `setInsets` and similar changes did not reach it, and call assertions such as `toHaveBeenCalled` missed its calls, so `not.toHaveBeenCalled` could pass when it should have failed. This affected only ES module builds in `node_modules` that import a preset package (for example `react-native-safe-area-context`), and only under `hotRuntime`; CommonJS dependencies and per-file runs were not affected. No action needed.
