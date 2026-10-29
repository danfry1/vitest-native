---
"vitest-native": patch
---

Under the native engine, a project file that a test imports and that a project module then loads with `require()` is now one module, with or without jest-compat. Node's `require` is given the instance Vite already evaluated, so state the test sets is the state the required module reads. Before, this only happened when jest-compat or a library's Jest setup file was in use. A project file that is required before it is imported is still loaded twice.
