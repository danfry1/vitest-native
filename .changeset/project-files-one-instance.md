---
"vitest-native": patch
---

Under the native engine, an ES-module project file that a test imports and that a project module then loads with `require()` is now one module, with or without jest-compat. Node's `require` is given the instance Vite already evaluated, so state the test sets is the state the required module reads. Before, this only happened when jest-compat or a library's Jest setup file was in use.

For projects without jest-compat this changes, as in Jest:

- `vi.spyOn` on a required module, and an assignment to one of its exports, now reach the files that import it.
- `instanceof` holds across the two loaders, for a class the test imported and a required module checks.
- Deleting a `require.cache` entry no longer gives a fresh module once the test has imported that file.
- With a partial `vi.mock` that spreads `importOriginal()`, Node's `require` gets the real module Vite evaluated, and shares its state.

Not covered yet: a project file that is required before it is imported is still loaded twice, and so is a CommonJS (`.cjs`) project file Vite evaluated.
