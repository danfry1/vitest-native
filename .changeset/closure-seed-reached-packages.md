---
"vitest-native": patch
---

**Under the native engine, a package that depends on a workspace library now compiles the installed React Native packages that library depends on.** A feature package depending on a workspace UI library that declares `expo-image` failed with `Cannot find module '…/expo-asset/build/Asset.fx'`: `expo-asset`, reached through `expo-image` and `expo`, was never compiled, because only the feature package's own declarations were followed. No action needed.

- The same applies to a workspace library imported through a string `resolve.alias` entry or, where Vite resolves them, tsconfig `paths`, without being declared. With `diagnostics: true` the plugin names such a library.
- What changes: more installed packages are compiled and loaded by Node in these projects. As for every Node-loaded package, a `vi.mock` from a test does not reach their internal imports.
- Unchanged: which owner a workspace library has. This change adds only installed packages (in `node_modules`), never a workspace member.
- Not covered: aliases with a regular-expression `find`, aliases other plugins add (vite-tsconfig-paths, Nx's `nxViteTsPaths`), and a `setupFiles` entry pointing into an undeclared workspace library; none of these is followed. Declaring the library as a dependency covers them.
