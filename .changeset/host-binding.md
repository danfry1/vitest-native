---
"vitest-native": patch
---

vitest-native now takes the Vite and Vitest versions from the instances that are running, not from the packages named `vite` and `vitest` found from the project root. Under Vite+, whose `vite` package is a wrapper's core reporting its own version, every run used to stop at startup with "requires vite >= 6.4.2, but found 1.3.0"; and a pnpm project that gets `vitest` through Vite+ rather than its own install failed with "vitest … was not found". Both now start, and `doctor` reports the bundled Vite. The version-dependent settings (the JSX transform, Expo's tsconfig paths, Vitest 5's module cache) follow the running versions too.

When two physical copies of Vitest are installed and vitest-native would load the one that is not running, the run now stops with `VITEST_TWIN_INSTANCE`, naming both copies, instead of every test file failing. Binding vitest-native's own runtime to the running copy is a later change.

`vitest-native init` writes a `vite.config.ts` with `defineConfig` from `'vite-plus'` when vite-plus is installed, and points to `vp test`.
