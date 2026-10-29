---
"vitest-native": patch
---

**Under the native engine, an ES-module project file that a test imports and a project module `require`s is now one module, with or without jest-compat.** Before, Node's `require` got Vite's instance only when jest-compat or a library's Jest setup file was in use, and otherwise loaded a second copy, so state the test set was not the state the required module read.

No action needed. A suite that relied on getting a fresh module after deleting a `require.cache` entry for a file the test imported now gets the imported one, as under Jest.

For projects without jest-compat, as in Jest:

- `vi.spyOn` on a required module, and an assignment to one of its exports, now reach the files that `import` it (before: only the required copy changed).
- `instanceof` now holds for a class the test imported and a required module checks (before: `false`).
- With a partial `vi.mock(path, async (importOriginal) => ({ ...(await importOriginal()), … }))`, Node's `require(path)` now gets the real module Vite evaluated and shares its state (before: a separate copy).

Not covered yet: a project file that is required before it is imported is still loaded twice, and so is a CommonJS (`.cjs`) project file Vite evaluated.
