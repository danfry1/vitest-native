---
"vitest-native": patch
---

Under the native engine, a workspace package that `resolve.alias` (or `test.alias`) points into, typically its source directory, is no longer auto-detected and handed to Node. Detection had externalized the package's whole directory, so Vite resolved the aliased files and Node loaded them. With string aliases this was silent: a sibling's store, written by the test, read back unset through a second copy. Regex aliases failed with "Cannot find module", and `import.meta` in the aliased source was a SyntaxError. The package is matched by directory, so regex aliases and aliases not named after the package are covered, and paths are compared as Node spells them, through symlinks. An installed React Native package that still requires such a package by name now triggers the engine's existing "Node resolved a file Vite owns" warning instead of silently loading a second copy. The `transform: { exclude: [...] }` workaround is no longer needed.
