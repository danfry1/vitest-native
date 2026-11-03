---
"vitest-native": patch
---

**Workspace libraries that declare `react-native` are owned as in 0.14.0-rc.10, and their setup files run under the native engine.** No action needed.

- **Workspace libraries are detected as in 0.14.0-rc.10.** 0.14.0-rc.11 also detected a workspace library whose `exports` map leaves out `./package.json`. That made the library Node-owned: `vi.mock` from tests no longer reached its internal imports, and any of its files importing `vitest` failed. Such a library now runs in Vite again. Installed packages with that exports shape, such as `expo-symbols`, are still detected and compiled. A `transform.exclude` entry added for such a library is no longer needed.
- **A setup file in a detected workspace library runs.** A detected library is one that exports `./package.json` or has no `exports` map. Listing its own file in `test.setupFiles` stopped the run with `MODULE_OWNER_CONFLICT` ("Vite attempted to transform '…/vitest.setup.ts', but the native ownership policy assigns that file to Node"). The setup file now runs in Vite, as test files do. Only the setup file moves: library files it imports still run under Node. A library file that imports `vitest` still needs `transform.exclude` for that library. A `vi.mock` in the setup file does not reach the library's own internal imports. Setup files inside `node_modules` are unchanged.
